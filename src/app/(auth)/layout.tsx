import Image from 'next/image';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-900 via-navy-700 to-navy-800 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Image
            src="/logo.png"
            alt="RxMatch"
            width={160}
            height={160}
            className="mx-auto mb-4 drop-shadow-lg"
            style={{ width: 80, height: 'auto' }}
          />
          <h1 className="text-3xl font-bold tracking-tight">
            <span className="text-white">Rx</span><span className="text-teal-400">Match</span>
          </h1>
          <p className="text-navy-300 mt-1 text-sm">Connecting Prescriptions to Catalogues</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 shadow-2xl">
          {children}
        </div>
      </div>
    </div>
  );
}
