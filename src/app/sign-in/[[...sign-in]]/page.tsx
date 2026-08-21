"use client";

import { createClient } from "@/utils/supabase/client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      setError(error.message || "Failed to sign in");
    } else {
      router.push("/");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] text-white">
      <div className="w-full max-w-md p-8 space-y-8 bg-zinc-900/50 border border-white/10 rounded-2xl">
        <div className="text-center">
          <h2 className="text-3xl font-light">Sign In</h2>
          <p className="mt-2 text-zinc-400">Access JARVIS</p>
        </div>
        
        <form onSubmit={handleSignIn} className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg">
              {error}
            </div>
          )}
          
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl focus:outline-none focus:border-white/20 transition-colors"
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl focus:outline-none focus:border-white/20 transition-colors"
              required
            />
          </div>
          
          <button
            type="submit"
            className="w-full px-6 py-3 bg-white text-black font-medium rounded-xl hover:bg-zinc-200 transition-colors"
          >
            Sign In
          </button>
        </form>
        
        <div className="text-center text-sm text-zinc-500">
          Don't have an account? <a href="/sign-up" className="text-white hover:underline">Sign up</a>
        </div>
      </div>
    </div>
  );
}
