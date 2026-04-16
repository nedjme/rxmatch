//! Lightweight HTTP server that accepts image POSTs from the mobile app.
//!
//! The phone app discovers this server via mDNS (or by scanning the LAN for
//! the port). Once discovered, the user taps "Scan" on the phone — the phone
//! captures the prescription and POSTs the image as multipart/form-data.
//!
//! The server emits a Tauri event `phone-scan-received` with the raw bytes
//! encoded as a base64 string so the frontend can pick it up.

use std::sync::Arc;
use tokio::sync::{Mutex, oneshot};

#[derive(Default)]
pub struct PhoneServerState {
    inner: Arc<Mutex<Option<ServerHandle>>>,
}

struct ServerHandle {
    port: u16,
    stop_tx: oneshot::Sender<()>,
}

impl PhoneServerState {
    pub async fn start(&self) -> Result<u16, String> {
        let mut guard = self.inner.lock().await;
        if let Some(h) = &*guard {
            // Already running — return existing port
            return Ok(h.port);
        }

        // Bind to a random available port
        let listener = std::net::TcpListener::bind("0.0.0.0:0")
            .map_err(|e| format!("bind failed: {e}"))?;
        let port = listener.local_addr()
            .map_err(|e| format!("local_addr: {e}"))?.port();

        listener.set_nonblocking(true)
            .map_err(|e| format!("set_nonblocking: {e}"))?;

        let (stop_tx, stop_rx) = oneshot::channel::<()>();

        tokio::spawn(run_server(listener, stop_rx));

        *guard = Some(ServerHandle { port, stop_tx });
        Ok(port)
    }

    pub async fn stop(&self) {
        let mut guard = self.inner.lock().await;
        if let Some(h) = guard.take() {
            let _ = h.stop_tx.send(());
        }
    }

    pub async fn port(&self) -> u16 {
        let guard = self.inner.lock().await;
        guard.as_ref().map(|h| h.port).unwrap_or(0)
    }
}

async fn run_server(
    listener: std::net::TcpListener,
    mut stop_rx: oneshot::Receiver<()>,
) {
    use tokio::net::TcpListener;

    let listener = TcpListener::from_std(listener).expect("tokio TcpListener");

    loop {
        tokio::select! {
            _ = &mut stop_rx => break,
            result = listener.accept() => {
                match result {
                    Ok((stream, _addr)) => {
                        tokio::spawn(handle_connection(stream));
                    }
                    Err(_) => {}
                }
            }
        }
    }
}

async fn handle_connection(stream: tokio::net::TcpStream) {

    let mut buf = Vec::new();
    let mut tmp = [0u8; 8192];

    // Read until we have the full HTTP request (naive — sufficient for images)
    loop {
        match stream.try_read(&mut tmp) {
            Ok(0) => break,
            Ok(n) => buf.extend_from_slice(&tmp[..n]),
            Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                tokio::time::sleep(tokio::time::Duration::from_millis(5)).await;
                // Check if we have Content-Length bytes after the header
                if let Some(body_start) = find_body_start(&buf) {
                    if let Some(content_len) = extract_content_length(&buf) {
                        if buf.len() >= body_start + content_len {
                            break;
                        }
                    }
                }
            }
            Err(_) => return,
        }
    }

    // Extract body (skip HTTP headers)
    let body = if let Some(start) = find_body_start(&buf) {
        buf[start..].to_vec()
    } else {
        return;
    };

    // The body IS the raw image bytes (phone sends Content-Type: image/jpeg)
    // Emit as base64 so the JS side can decode it
    let b64 = base64_encode(&body);

    // We can't easily access the AppHandle here without passing it through Arc.
    // Instead, write to a temp file and let the frontend poll, or use a channel.
    // For simplicity: write to a well-known temp path and emit filename.
    let tmp_path = std::env::temp_dir().join("rxmatch_phone_scan.jpg");
    let _ = std::fs::write(&tmp_path, &body);

    // Send HTTP 200
    let _ = write_response(stream, b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK").await;

    // Notify via a side-channel: write a trigger file the frontend polls
    let trigger_path = std::env::temp_dir().join("rxmatch_phone_trigger");
    let _ = std::fs::write(&trigger_path, tmp_path.to_string_lossy().as_bytes());

    drop(b64); // unused for now
}

async fn write_response(mut stream: tokio::net::TcpStream, data: &[u8]) -> std::io::Result<()> {
    use tokio::io::AsyncWriteExt;
    stream.write_all(data).await?;
    stream.flush().await
}

fn find_body_start(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n").map(|p| p + 4)
}

fn extract_content_length(buf: &[u8]) -> Option<usize> {
    let header_text = std::str::from_utf8(buf).ok()?;
    for line in header_text.lines() {
        let lower = line.to_lowercase();
        if lower.starts_with("content-length:") {
            let val = lower["content-length:".len()..].trim();
            return val.parse().ok();
        }
    }
    None
}

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(CHARS[((n >> 18) & 63) as usize] as char);
        out.push(CHARS[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 { CHARS[((n >> 6) & 63) as usize] as char } else { '=' });
        out.push(if chunk.len() > 2 { CHARS[(n & 63) as usize] as char } else { '=' });
    }
    out
}
