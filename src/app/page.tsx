import { JarvisAppShell } from "@/components/jarvis/JarvisAppShell";
import { Show, SignInButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <>
      <Show when="signed-in">
        <JarvisAppShell />
      </Show>
      <Show when="signed-out">
        <div className="flex h-screen w-full items-center justify-center bg-black">
          <div className="text-center">
             <h1 className="text-4xl font-light text-zinc-100 mb-8">JARVIS Initialization Required</h1>
             <SignInButton mode="modal">
               <button className="px-6 py-3 bg-white/[0.03] border border-white/[0.05] rounded-xl text-zinc-300 hover:text-white hover:bg-white/[0.05] transition-all">
                 Sign In to Access Systems
               </button>
             </SignInButton>
          </div>
        </div>
      </Show>
    </>
  );
}
