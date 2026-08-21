import { JarvisAppShell } from "@/components/jarvis/JarvisAppShell";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers()
  });

  if (session) {
    return <JarvisAppShell />;
  }

  return (
    <div className="flex h-screen w-full items-center justify-center bg-black">
      <div className="text-center">
         <h1 className="text-4xl font-light text-zinc-100 mb-8">JARVIS Initialization Required</h1>
         <Link href="/sign-in">
           <button className="px-6 py-3 bg-white/[0.03] border border-white/[0.05] rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-all">
             Sign In to Access Systems
           </button>
         </Link>
      </div>
    </div>
  );
}
