'use client';

import React, { useState } from 'react';
import {
  Building2,
  Wrench,
  ShieldCheck,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Sliders,
  TrendingUp,
  Plus,
  ArrowRight,
  Sparkles
} from 'lucide-react';

export default function EclipseWireframe() {
  const [activeTab, setActiveTab] = useState<'onboarding' | 'maintenance'>('onboarding');
  const [showToast, setShowToast] = useState(false);

  // Mock Data for Onboarding
  const onboardingApplications = [
    { id: 'APP-0941', partner: 'Island Lounge & Bar', parish: 'Westmoreland', status: 'Pending Verification', license: 'BGLC-O-8821', date: 'Oct 04, 2026' },
    { id: 'APP-0939', partner: 'Bold Cutz Gaming Parlor', parish: 'St. James', status: 'Approved', license: 'BGLC-O-4412', date: 'Oct 02, 2026' },
    { id: 'APP-0938', partner: 'Pier 1 Entertainment', parish: 'St. James', status: 'Action Required', license: 'Expired-2025', date: 'Oct 01, 2026' },
  ];

  // Mock Data for Tickets
  const activeTickets = [
    { id: 'TKT-412', location: 'Skylark Lounge (Negril)', code: 'ERR-04 (Bill Acceptor Jam)', priority: 'High', status: 'Technician Dispatched', elapsed: '22 mins' },
    { id: 'TKT-410', location: 'Monarch Sports Betting', code: 'ERR-12 (RNG Sync Failure)', priority: 'Critical', status: 'Open', elapsed: '5 mins' },
    { id: 'TKT-408', location: 'Sol Gas Station Gaming Corner', code: 'ERR-01 (Hopper Empty)', priority: 'Medium', status: 'Resolved', elapsed: '1 hr 15 mins' },
  ];

  const handleSimulateAction = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 3500);
  };

  const pipelineBadge = (status: string) => {
    if (status === 'Approved') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 className="w-3.5 h-3.5" /> {status}
        </span>
      );
    }
    if (status === 'Action Required') {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <AlertTriangle className="w-3.5 h-3.5" /> {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <Clock className="w-3.5 h-3.5" /> {status}
      </span>
    );
  };

  const priorityBadge = (priority: string) => {
    const styles: Record<string, string> = {
      Critical: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      High: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      Medium: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
    };
    return (
      <span className={`text-xs font-bold px-2 py-1 rounded-md border ${styles[priority] ?? 'bg-slate-800 text-slate-300 border-slate-700'}`}>
        {priority}
      </span>
    );
  };

  const ticketStatus = (status: string) => {
    if (status === 'Resolved') {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5" /> {status}
        </span>
      );
    }
    if (status === 'Open') {
      return (
        <span className="inline-flex items-center gap-1 text-xs text-rose-400">
          <AlertTriangle className="w-3.5 h-3.5" /> {status}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-400">
        <Wrench className="w-3.5 h-3.5" /> {status}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans p-6 selection:bg-emerald-500 selection:text-slate-900">

      {/* Toast Notification Simulation */}
      {showToast && (
        <div
          role="status"
          className="fixed bottom-5 right-5 bg-emerald-500 text-slate-950 px-4 py-3 rounded-lg shadow-xl flex items-center gap-2 font-medium z-50 animate-bounce"
        >
          <Sparkles className="w-5 h-5" />
          <span>Interactive Wireframe Action Simulated Successfully!</span>
        </div>
      )}

      {/* Wireframe Metadata & Pitch Header */}
      <div className="max-w-7xl mx-auto mb-8 border border-dashed border-slate-700 p-4 rounded-xl bg-slate-950/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="inline-block text-xs font-bold tracking-widest uppercase bg-emerald-500/10 text-emerald-400 px-2.5 py-1 rounded-md mb-2">
            PROPOSAL WIREFRAME CONCEPT
          </span>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            Eclipse Enterprise Operations Portal <span className="text-xs text-slate-400 font-normal">(v1.0-Concept)</span>
          </h1>
          <p className="text-sm text-slate-400 mt-1 max-w-xl">
            Designed for David (Operations Manager) to centralize BGLC compliance workflows, speed up terminal uptime, and phase out phone/WhatsApp tracking errors.
          </p>
        </div>
        <div className="text-right text-xs text-slate-500 border-t md:border-t-0 md:border-l border-slate-800 pt-3 md:pt-0 md:pl-6 shrink-0">
          <div>Project: Eclipse Ops Hub</div>
          <div>Stack: Tailwind CSS + Next.js Framework</div>
          <div>Author: Tech System Partner</div>
        </div>
      </div>

      {/* Main Container */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Sidebar Component Navigation */}
        <div className="lg:col-span-1 bg-slate-950 border border-slate-800 rounded-xl p-5 flex flex-col justify-between shadow-lg">
          <div>
            <div className="flex items-center gap-2.5 px-2 py-3 border-b border-slate-800 mb-6">
              <div className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center font-bold text-slate-950">
                EE
              </div>
              <div>
                <div className="font-bold text-white text-sm">Eclipse Enterprise</div>
                <div className="text-xs text-slate-400">Technical Service Provider</div>
              </div>
            </div>

            <nav className="space-y-1">
              <button
                onClick={() => setActiveTab('onboarding')}
                className={`w-full flex items-center justify-between p-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'onboarding'
                    ? 'bg-slate-800 text-white border-l-4 border-emerald-500 pl-2'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-4 h-4" />
                  <span>Operator Onboarding</span>
                </div>
                <span className="bg-slate-900 border border-slate-800 text-xs px-2 py-0.5 rounded-full text-slate-300">
                  {onboardingApplications.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('maintenance')}
                className={`w-full flex items-center justify-between p-3 rounded-lg text-sm font-medium transition-all ${
                  activeTab === 'maintenance'
                    ? 'bg-slate-800 text-white border-l-4 border-emerald-500 pl-2'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Wrench className="w-4 h-4" />
                  <span>Live Ticket Dispatch</span>
                </div>
                <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs px-2 py-0.5 rounded-full font-bold">
                  2 New
                </span>
              </button>
            </nav>
          </div>

          {/* Quick Metrics Component */}
          <div className="mt-8 pt-5 border-t border-slate-800 space-y-4">
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <div className="text-xs text-slate-400 flex items-center justify-between mb-1">
                <span>Avg. Onboard Speed</span>
                <TrendingUp className="w-3 h-3 text-emerald-400" />
              </div>
              <div className="text-lg font-bold text-white">1.8 Business Days</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Down from 7 days over paper</div>
            </div>
            <div className="bg-slate-900/60 p-3 rounded-lg border border-slate-800/80">
              <div className="text-xs text-slate-400 flex items-center justify-between mb-1">
                <span>Active Field Uptime</span>
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
              </div>
              <div className="text-lg font-bold text-white">99.4%</div>
              <div className="text-[10px] text-slate-500 mt-0.5">Instant SLA tracking enabled</div>
            </div>
          </div>
        </div>

        {/* Content Area dynamic window */}
        <div className="lg:col-span-3 bg-slate-950 border border-slate-800 rounded-xl shadow-lg flex flex-col overflow-hidden">

          {/* Active View Title bar */}
          <div className="px-6 py-4 bg-slate-900/40 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-white">
                {activeTab === 'onboarding' ? 'Partner Onboarding Pipeline' : 'Technical Ticket & Maintenance Panel'}
              </h2>
              <p className="text-xs text-slate-400">
                {activeTab === 'onboarding'
                  ? 'Verifying prospective operator corporate documents and active BGLC slot licenses.'
                  : 'Real-time terminal errors forwarded by commercial bar managers.'}
              </p>
            </div>

            <button
              onClick={handleSimulateAction}
              className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition-colors self-start sm:self-center"
            >
              <Plus className="w-3.5 h-3.5" />
              {activeTab === 'onboarding' ? 'New Operator Form' : 'Log Terminal Breakdown'}
            </button>
          </div>

          {/* Tab 1: Onboarding View */}
          {activeTab === 'onboarding' && (
            <div className="p-6 overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-xs font-semibold tracking-wider uppercase bg-slate-900/20">
                    <th className="pb-3 pt-2 px-3">Application ID</th>
                    <th className="pb-3 pt-2 px-3">Commercial Operator</th>
                    <th className="pb-3 pt-2 px-3">BGLC License Status</th>
                    <th className="pb-3 pt-2 px-3">Pipeline Status</th>
                    <th className="pb-3 pt-2 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-sm">
                  {onboardingApplications.map((app) => (
                    <tr key={app.id} className="hover:bg-slate-900/30 transition-colors group">
                      <td className="py-4 px-3 font-mono text-xs text-slate-400 font-medium">{app.id}</td>
                      <td className="py-4 px-3">
                        <div className="font-semibold text-white">{app.partner}</div>
                        <div className="text-xs text-slate-500">{app.parish}, Jamaica • {app.date}</div>
                      </td>
                      <td className="py-4 px-3">
                        <div className="flex items-center gap-1.5">
                          <FileText className={`w-4 h-4 ${app.license.startsWith('Expired') ? 'text-rose-400' : 'text-slate-400'}`} />
                          <span className={`font-mono text-xs ${app.license.startsWith('Expired') ? 'text-rose-400' : 'text-slate-300'}`}>
                            {app.license}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-3">{pipelineBadge(app.status)}</td>
                      <td className="py-4 px-3 text-right">
                        <button
                          onClick={handleSimulateAction}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                          Review <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Tab 2: Maintenance View */}
          {activeTab === 'maintenance' && (
            <div className="p-6 space-y-4">
              {activeTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className={`p-4 rounded-lg border bg-slate-900/40 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                    ticket.priority === 'Critical' ? 'border-rose-500/30' : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                      <Sliders className="w-4 h-4 text-slate-300" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-slate-400">{ticket.id}</span>
                        {priorityBadge(ticket.priority)}
                      </div>
                      <div className="font-semibold text-white mt-1">{ticket.location}</div>
                      <div className="text-xs text-slate-400 font-mono mt-0.5">{ticket.code}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between md:justify-end gap-6">
                    <div className="text-right">
                      {ticketStatus(ticket.status)}
                      <div className="text-[11px] text-slate-500 flex items-center justify-end gap-1 mt-1">
                        <Clock className="w-3 h-3" /> {ticket.elapsed}
                      </div>
                    </div>
                    <button
                      onClick={handleSimulateAction}
                      disabled={ticket.status === 'Resolved'}
                      className="text-xs font-bold px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      {ticket.status === 'Open' ? 'Dispatch Tech' : ticket.status === 'Resolved' ? 'Closed' : 'Update'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Footer note */}
          <div className="mt-auto px-6 py-3 border-t border-slate-800 text-[11px] text-slate-500 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            All records shown are mock data for proposal purposes only.
          </div>
        </div>
      </div>
    </div>
  );
}
