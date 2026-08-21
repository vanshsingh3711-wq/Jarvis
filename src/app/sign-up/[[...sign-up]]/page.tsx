"use client";

import { authClient } from "@/lib/auth-client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const { data, error } = await authClient.signUp.email({
      email,
      password,
      name,
    });
    
    if (error) {
      setError(error.message || "Failed to sign up");
    } else {
      router.push("/");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050505] text-white">
      <div className="w-full max-w-md p-8 space-y-8 bg-zinc-900/50 border border-white/10 rounded-2xl">
        <div className="text-center">
          <h2 className="text-3xl font-light">Sign Up</h2>
          <p className="mt-2 text-zinc-400">Create a JARVIS account</p>
        </div>
        
        <form onSubmit={handleSignUp} className="space-y-6">
          {error && (
            <div className="p-3 text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm text-zinc-400">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl focus:outline-none focus:border-white/20 transition-colors"
              required
            />
          </div>
          
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
            Sign Up
          </button>
        </form>
        
        <div className="text-center text-sm text-zinc-500">
          Already have an account? <a href="/sign-in" className="text-white hover:underline">Sign in</a>
        </div>
      </div>
    </div>
  );
}
