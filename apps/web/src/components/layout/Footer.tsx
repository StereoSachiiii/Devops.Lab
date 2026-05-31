import Link from "next/link";
import { Terminal } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white mt-auto">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row justify-between items-center md:items-start gap-8">
          <div className="flex flex-col items-center md:items-start gap-2">
            <div className="flex items-center gap-2">
              <Terminal size={20} />
              <span className="text-lg font-bold">DevOps.lab</span>
            </div>
            <p className="text-sm text-gray-500 max-w-xs text-center md:text-left">
              Level up your DevOps Engineering Skills. Solve real-world infrastructure challenges.
            </p>
          </div>
          
          <div className="flex gap-16">
            <div className="flex flex-col gap-3">
              <span className="font-bold">Platform</span>
              <Link href="/challenges" className="text-sm hover:underline">Challenges</Link>
              <Link href="/paths" className="text-sm hover:underline">Learning Paths</Link>
              <Link href="/leaderboard" className="text-sm hover:underline">Leaderboard</Link>
            </div>
            <div className="flex flex-col gap-3">
              <span className="font-bold">Support</span>
              <Link href="/contribute" className="text-sm hover:underline">Contribute</Link>
              <Link href="/settings" className="text-sm hover:underline">Settings</Link>
              <Link href="/support" className="text-sm hover:underline">Help Center</Link>
            </div>
          </div>
        </div>
        <div className="mt-12 pt-8 border-t border-gray-100 flex justify-between items-center flex-col sm:flex-row text-xs text-gray-400">
          <p>© {new Date().getFullYear()} DevOps.lab. All rights reserved.</p>
          <div className="flex gap-4 mt-4 sm:mt-0">
            <Link href="/privacy" className="hover:underline">Privacy Policy</Link>
            <Link href="/terms" className="hover:underline">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
