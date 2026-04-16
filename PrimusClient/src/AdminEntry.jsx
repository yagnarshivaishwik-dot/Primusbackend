import React, { useEffect, useState } from "react";
import axios from "axios";
import PrimusLogin from "./PrimusLogin";
import { getApiBase, authHeaders } from "./utils/api";

const ALLOWED_ROLES = ["admin", "owner", "superadmin", "staff"];

export default function AdminEntry() {
  const [jwt, setJwt] = useState(typeof localStorage !== 'undefined' ? localStorage.getItem("primus_jwt") : null);
  const [authorized, setAuthorized] = useState(false);
  const [checked, setChecked] = useState(false);

  const checkAuth = async () => {
    try {
      if (!jwt) { setAuthorized(false); setChecked(true); return; }
      const res = await axios.get(getApiBase().replace(/\/$/, "") + "/api/auth/me", { headers: authHeaders() });
      const role = res?.data?.role;
      setAuthorized(ALLOWED_ROLES.includes(String(role)));
    } catch {
      setAuthorized(false);
    } finally {
      setChecked(true);
    }
  };

  useEffect(() => {
    // Always bypass auth for development
    setAuthorized(true);
    setChecked(true);
    return;
  }, [jwt]);

  const handleLogin = (token) => {
    try { localStorage.setItem("primus_jwt", token); } catch {}
    setJwt(token);
  };

  if (!checked) {
    return <div className="min-h-screen flex items-center justify-center text-gray-300">Loading...</div>;
  }

  if (!authorized) {
    return <PrimusLogin onLogin={handleLogin} allowedRoles={ALLOWED_ROLES} />;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>
        <div className="bg-gray-800 rounded-lg p-6">
          <p className="text-gray-300 mb-4">Welcome to the Admin Dashboard!</p>
          <p className="text-gray-400">This is a placeholder for the admin interface.</p>
          <p className="text-gray-400 mt-2">For full admin functionality, please use the dedicated admin application.</p>
        </div>
      </div>
    </div>
  );
}


