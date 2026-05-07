'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { formatToWAT } from '@/lib/utils/time';
import {
  Cpu, Terminal, Globe, Lock, Database, Shield,
  CheckCircle, RefreshCcw, Plus, Trash2, Eye, EyeOff,
  Zap, Activity, History, Server, LogOut, AlertTriangle,
  Loader2, Play, Check, X, Brain, Search
} from 'lucide-react';

const TABS = [
  { id: 'agents',   label: 'Neural Agents',   icon: Cpu },
  { id: 'prompts',  label: 'Prompt Engine',   icon: Terminal },
  { id: 'scraping', label: 'Crawl Routes',    icon: Globe },
  { id: 'data',     label: 'Data Viewer',     icon: Database },
  { id: 'processor', label: 'Intelligence',   icon: Brain },
  { id: 'history',  label: 'Prediction Logs', icon: History },
  { id: 'security', label: 'Vault',           icon: Lock },
];

const FOOTBALL_PROVIDERS = [
  { id: 'api1', name: 'API-Football (Sports)', url: 'api-sports.io' },
  { id: 'api2', name: 'Football-Data.org', url: 'football-data.org' },
  { id: 'api3', name: 'TheSportsDB.com', url: 'thesportsdb.com' },
  { id: 'api4', name: 'APIFootball.com', url: 'apifootball.com' },
];

const fadeIn = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

export default function AdminPage() {
  const router = useRouter();

  const [active,   setActive]   = useState('agents');
  const [config,   setConfig]   = useState<any>(null);
  const [history,  setHistory]  = useState<any[]>([]);
  const [health,   setHealth]   = useState<any>(null);
  const [scrapedData, setScrapedData] = useState<any[]>([]);
  const [processedData, setProcessedData] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [isScraping, setIsScraping] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };
  
  // Tab persistence
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && TABS.some(t => t.id === tab)) {
      setActive(tab);
    }
  }, []);

  const handleTabChange = (id: string) => {
    setActive(id);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', id);
    window.history.replaceState({}, '', url);
  };
  const [showKey,  setShowKey]  = useState<Record<string, boolean>>({});
  const [testing,  setTesting]  = useState<Record<string, boolean>>({});
  const [testRes,  setTestRes]  = useState<Record<string, { success: boolean; msg: string }>>({});

  /* ── Single combined fetch ───────────────────────────────── */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch('/api/admin/overview');
      if (res.status === 401) { router.push('/admin/login'); return; }
      const data = await res.json();
      setConfig(data.config);
      setHistory(Array.isArray(data.history) ? data.history : []);
      setHealth(data.health);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
    const t = setInterval(() => {
      fetch('/api/admin/health').then(r => r.json()).then(setHealth);
    }, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [pageInput, setPageInput] = useState('');
  
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotalPages, setHistoryTotalPages] = useState(1);
  const [historySearch, setHistorySearch] = useState('');
  const [historyPageInput, setHistoryPageInput] = useState('');
  const [selectedSlip, setSelectedSlip] = useState<any>(null);

  /* ── Load Scraped Data ─────────────────────────────────────── */
  const loadScrapedData = async (pageNum = page, search = searchQuery) => {
    try {
      const res = await fetch(`/api/admin/scraped-data?page=${pageNum}&search=${encodeURIComponent(search)}`);
      const json = await res.json();
      if (json.success) {
        setScrapedData(json.data);
        setPage(json.pagination.page);
        setTotalPages(json.pagination.totalPages);
        setPageInput(json.pagination.page.toString());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (active === 'data') loadScrapedData(1);
  }, [active]);

  /* ── Trigger Scraper ─────────────────────────────────────── */
  const triggerScraping = async () => {
    setIsScraping(true);
    try {
      await fetch('/api/cron/scrape');
      await loadScrapedData(); // refresh data after scraping
    } catch (e) {
      console.error('Failed to trigger scraper:', e);
    } finally {
      setIsScraping(false);
    }
  };
  
  /* ── Trigger Processor ───────────────────────────────────── */
  const triggerProcessing = async () => {
    setIsProcessing(true);
    try {
      const res = await fetch('/api/admin/process', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification(`Successfully processed ${data.count} records.`, 'success');
        if (active === 'processor') loadProcessedData();
      } else {
        showNotification(`Processing failed: ${data.error}`, 'error');
      }
    } catch (e) {
      console.error('Failed to trigger processor:', e);
    } finally {
      setIsProcessing(false);
    }
  };

  /* ── Clean Old Data ──────────────────────────────────────── */
  const cleanOldData = async () => {
    if (!confirm('Are you sure you want to delete all data older than 10 days?')) return;
    setIsCleaning(true);
    try {
      const res = await fetch('/api/admin/process', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showNotification(`Cleanup successful: Removed ${data.result.scraped} scraped and ${data.result.processed} processed records.`, 'success');
        loadScrapedData();
        loadProcessedData();
      }
    } catch (e) {
      console.error('Cleanup failed:', e);
    } finally {
      setIsCleaning(false);
    }
  };

  const [sourceStatuses, setSourceStatuses] = useState<Record<string, any>>({});
  const [isScrapingTarget, setIsScrapingTarget] = useState<string | null>(null);

  /* ── Targeted Scraping ─────────────────────────────────────── */
  const loadStatuses = async () => {
    try {
      const res = await fetch('/api/admin/sources/status');
      const json = await res.json();
      if (json.success) setSourceStatuses(json.statuses);
    } catch (e) {
      console.error('Failed to load statuses:', e);
    }
  };

  /* ── Load Processed Data ─────────────────────────────────────── */
  const loadProcessedData = async () => {
    try {
      const res = await fetch('/api/admin/processed-data');
      const json = await res.json();
      if (json.success) setProcessedData(json.data);
    } catch (e) {
      console.error(e);
    }
  };

  const triggerTargetedScrape = async (type: 'api' | 'web', target: string) => {
    setIsScrapingTarget(target);
    try {
      const res = await fetch('/api/cron/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, target })
      });
      const data = await res.json();
      if (data.success) {
        showNotification(`Successfully scraped ${data.count} records from ${target}`, 'success');
        loadScrapedData();
      } else {
        showNotification(`Scraping failed: ${data.details || data.error}`, 'error');
      }
    } catch (e) {
      console.error('Failed to trigger targeted scrape:', e);
      showNotification('Network or server error occurred while trying to scrape.', 'error');
    } finally {
      setIsScrapingTarget(null);
    }
  };

  /* ── Load History ─────────────────────────────────────────── */
  const loadHistory = async (pageNum = historyPage, search = historySearch) => {
    try {
      const res = await fetch(`/api/admin/history?page=${pageNum}&search=${encodeURIComponent(search)}`);
      const json = await res.json();
      if (json.success) {
        setHistory(json.data);
        setHistoryPage(json.pagination.page);
        setHistoryTotalPages(json.pagination.totalPages);
        setHistoryPageInput(json.pagination.page.toString());
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (active === 'data') {
      loadScrapedData();
      loadStatuses();
    }
    if (active === 'processor') loadProcessedData();
    if (active === 'history') loadHistory(1);
  }, [active]);
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.success && data.config) {
        // Update local state with the verified-saved config from DB
        setConfig(data.config);
        setSaved(true);
        showNotification('Configuration saved successfully!', 'success');
        setTimeout(() => setSaved(false), 2500);
      } else {
        console.error("Save failed:", data.error);
        showNotification(`Failed to save configuration: ${data.error || 'Unknown Error'}`, 'error');
      }
    } catch (e) {
      console.error('Save failed:', e);
      showNotification("Failed to save configuration due to a network error.", 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ── Logout ──────────────────────────────────────────────── */
  const handleLogout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' });
    router.push('/admin/login');
  };

  /* ── Test Connection ─────────────────────────────────────── */
  const testConnection = async (type: string, provider: string, apiKey: string) => {
    const id = `${type}-${provider}`;
    setTesting(prev => ({ ...prev, [id]: true }));
    setTestRes(prev => {
      const u = { ...prev };
      delete u[id];
      return u;
    });

    try {
      const res = await fetch('/api/admin/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, provider, apiKey }),
      });
      const data = await res.json();
      setTestRes(prev => ({ ...prev, [id]: { success: data.success, msg: data.success ? data.message : data.error } }));
    } catch (e: any) {
      setTestRes(prev => ({ ...prev, [id]: { success: false, msg: e.message } }));
    } finally {
      setTesting(prev => ({ ...prev, [id]: false }));
    }
  };

  /* ── Update Slip Status ──────────────────────────────────── */
  const updateSlipStatus = async (id: string, status: string) => {
    setHistory(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    try {
      await fetch('/api/admin/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
    } catch (e) {
      console.error('Failed to update status', e);
    }
  };

  /* ── Loading state ───────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-64px)] gap-4">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <p className="text-sm text-muted-foreground">Loading admin panel…</p>
      </div>
    );
  }

  const agents = [
    { name: 'Scraper Agent',   icon: Globe,        status: health?.status === 'healthy' ? 'online' : 'offline', load: '12%', color: 'text-cyan-500',    bg: 'bg-cyan-500/10' },
    { name: 'Processor Agent', icon: Brain,        status: isProcessing ? 'busy' : 'online', load: '28%', color: 'text-amber-500',   bg: 'bg-amber-500/10' },
    { name: 'Analyst Agent',   icon: Terminal,      status: health?.status === 'healthy' ? 'online' : 'offline', load: '45%', color: 'text-violet-500',  bg: 'bg-violet-500/10' },
    { name: 'Validator Agent', icon: CheckCircle,   status: 'idle',    load: '0%',  color: 'text-muted-foreground', bg: 'bg-secondary' },
    { name: 'Health Agent',    icon: Shield,        status: 'online',  load: '5%',  color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 pb-24">
      {/* ── Notification Banner ────────────────────────────── */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 border ${
              notification.type === 'error' ? 'bg-destructive/10 border-destructive/20 text-destructive' :
              notification.type === 'info' ? 'bg-primary/10 border-primary/20 text-primary' :
              'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
            }`}
          >
            {notification.type === 'error' ? <AlertTriangle size={18} /> : <CheckCircle size={18} />}
            <p className="text-sm font-bold">{notification.message}</p>
            <button onClick={() => setNotification(null)} className="ml-2 hover:opacity-70 transition-opacity">
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Header ───────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="badge badge-purple gap-2">
              <span className="dot-online" />
              Admin OS v4.5
            </span>
          </div>
          <h1 className="font-display text-3xl font-black text-foreground">Control Center</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage AI consensus, data providers, and system intelligence.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {active !== 'history' && (
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving
                ? <Loader2 size={15} className="animate-spin" />
                : saved
                ? <CheckCircle size={15} />
                : <Zap size={15} />}
              {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Changes'}
            </button>
          )}
          <button
            onClick={handleLogout}
            className="btn-ghost flex items-center gap-2 text-muted-foreground hover:text-destructive hover:border-destructive/30"
          >
            <LogOut size={15} />
            Logout
          </button>
        </div>
      </div>

      {/* ── Layout ───────────────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row gap-6">

        {/* Sidebar */}
        <aside className="lg:w-56 shrink-0 space-y-3">
          <nav className="card-base p-2 flex flex-row lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => handleTabChange(id)}
                className={active === id ? 'sidebar-item-active' : 'sidebar-item'}
              >
                <Icon size={16} className="shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </nav>

          {/* Status card — desktop */}
          <div className="hidden lg:block card-base p-4 space-y-3">
            <p className="section-label">System Status</p>
            <div className="flex items-center gap-2 text-sm">
              <span className={health?.database === 'online' ? 'dot-online' : 'dot-offline'} />
              <span className="font-medium text-foreground capitalize">
                {health?.status || 'Unknown'}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Server size={14} className="shrink-0" />
              {health?.database === 'online' ? 'DB Connected' : 'DB Offline'}
            </div>
            <div className="pt-2 border-t border-border">
              <button onClick={load} className="btn-ghost w-full text-xs gap-2 py-1.5">
                <RefreshCcw size={13} /> Refresh
              </button>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          <AnimatePresence mode="wait">

            {/* ── Agents ───────────────────────────────────────── */}
            {active === 'agents' && (
              <motion.div key="agents" variants={fadeIn} initial="hidden" animate="show" exit="hidden" className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {agents.map(({ name, icon: Icon, status, load, color, bg }) => (
                    <div key={name} className="card-base p-5 flex items-center gap-4">
                      <div className={`p-3 rounded-lg shrink-0 ${bg} ${color}`}>
                        <Icon size={22} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm text-foreground truncate">{name}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className={
                            status === 'online' ? 'dot-online' :
                            status === 'busy'   ? 'dot-busy'   :
                            status === 'idle'   ? 'dot-idle'   : 'dot-offline'
                          } />
                          <span className="text-xs text-muted-foreground capitalize">{status}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="section-label mb-0.5">Load</p>
                        <p className="font-display font-black text-lg text-foreground">{load}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Gateways */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* AI Gateways */}
                  <div className="card-base overflow-hidden">
                    <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                      <Activity size={16} className="text-primary" />
                      <h3 className="font-semibold text-sm text-foreground">Neural AI Gateways</h3>
                    </div>
                    <div className="divide-y divide-border">
                      {config?.aiProviders && Object.entries(config.aiProviders).map(([id, p]: [string, any]) => (
                        <div key={id} className="px-6 py-4 flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <Zap size={18} className="text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground capitalize">{id}</p>
                              <p className="text-xs text-muted-foreground truncate">AI provider</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={p.enabled ? 'badge badge-purple' : 'badge badge-gray'}>
                              {p.enabled ? 'Active' : 'Inactive'}
                            </span>
                            <button
                              onClick={() => {
                                const u = { ...config.aiProviders, [id]: { ...p, enabled: !p.enabled } };
                                setConfig({ ...config, aiProviders: u });
                              }}
                              className="btn-ghost text-xs px-3 py-1"
                            >
                              Toggle
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Football Data Gateways */}
                  <div className="card-base overflow-hidden">
                    <div className="px-6 py-4 border-b border-border flex items-center gap-2">
                      <Globe size={16} className="text-cyan-500" />
                      <h3 className="font-semibold text-sm text-foreground">Football Data Gateways</h3>
                    </div>
                    <div className="divide-y divide-border">
                      {FOOTBALL_PROVIDERS.map((provider) => {
                        const p = config?.footballApis?.[provider.id] || { enabled: false };
                        return (
                          <div key={provider.id} className="px-6 py-4 flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 min-w-0">
                              <Database size={18} className="text-muted-foreground shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-foreground">{provider.name}</p>
                                <p className="text-xs text-muted-foreground truncate">{provider.url}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={p.enabled ? 'badge badge-purple' : 'badge badge-gray'}>
                                {p.enabled ? 'Active' : 'Inactive'}
                              </span>
                              <button
                                onClick={() => {
                                  const u = { ...config.footballApis };
                                  u[provider.id] = { ...u[provider.id], enabled: !p.enabled };
                                  setConfig({ ...config, footballApis: u });
                                }}
                                className="btn-ghost text-xs px-3 py-1"
                              >
                                {p.enabled ? 'Disable' : 'Enable'}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Prompts ──────────────────────────────────────── */}
            {active === 'prompts' && (
              <motion.div key="prompts" variants={fadeIn} initial="hidden" animate="show" exit="hidden">
                <div className="card-base overflow-hidden">
                  <div className="px-6 py-4 border-b border-border">
                    <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                      <Terminal size={16} className="text-primary" /> Agent Behavior Patterns
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      These prompts control how each AI agent reasons and responds.
                    </p>
                  </div>
                  <div className="p-6 space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="section-label">Analyst Reasoning</label>
                        <span className="badge badge-purple">AI Optimised</span>
                      </div>
                      <textarea
                        rows={8}
                        className="form-textarea"
                        value={config?.agentPrompts?.analyst || ''}
                        onChange={e => setConfig({
                          ...config,
                          agentPrompts: { ...config.agentPrompts, analyst: e.target.value }
                        })}
                        placeholder="Define how the analyst agent reasons about match outcomes…"
                      />
                    </div>
                    <div>
                      <label className="section-label block mb-2">Scraper Heuristics</label>
                      <textarea
                        rows={4}
                        className="form-textarea"
                        value={config?.agentPrompts?.scraper || ''}
                        onChange={e => setConfig({
                          ...config,
                          agentPrompts: { ...config.agentPrompts, scraper: e.target.value }
                        })}
                        placeholder="Define how the scraper agent filters and normalises data…"
                      />
                    </div>
                    <div>
                      <label className="section-label block mb-2">Processor Logic</label>
                      <textarea
                        rows={4}
                        className="form-textarea"
                        value={config?.agentPrompts?.processor || ''}
                        onChange={e => setConfig({
                          ...config,
                          agentPrompts: { ...config.agentPrompts, processor: e.target.value }
                        })}
                        placeholder="Define how the processor agent organizes and sorts match data…"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Scraping ─────────────────────────────────────── */}
            {active === 'scraping' && (
              <motion.div key="scraping" variants={fadeIn} initial="hidden" animate="show" exit="hidden">
                <div className="card-base overflow-hidden">
                  <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                      <Globe size={16} className="text-cyan-500" /> Crawl Targets
                    </h3>
                    <button
                      className="btn-primary text-xs px-3 py-1.5"
                      onClick={() => {
                        const url = prompt('Enter target URL:');
                        if (url?.trim()) {
                          setConfig({ ...config, scrapingUrls: [...(config.scrapingUrls || []), url.trim()] });
                        }
                      }}
                    >
                      <Plus size={14} /> Add URL
                    </button>
                  </div>

                  {(config?.scrapingUrls?.length ?? 0) > 0 ? (
                    <div className="divide-y divide-border">
                      {config.scrapingUrls.map((url: string, i: number) => (
                        <div key={i} className="px-6 py-4 flex items-center gap-4">
                          <Globe size={16} className="text-muted-foreground shrink-0" />
                          <p className="text-sm text-foreground font-mono truncate flex-1">{url}</p>
                          <button
                            className="btn-icon shrink-0 hover:text-destructive hover:border-destructive/30"
                            onClick={() => setConfig({
                              ...config,
                              scrapingUrls: config.scrapingUrls.filter((_: any, j: number) => j !== i)
                            })}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-6 py-12 text-center text-muted-foreground text-sm">
                      No crawl targets configured. Click "Add URL" to get started.
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Data Viewer ──────────────────────────────────────── */}
            {active === 'data' && (
              <motion.div key="data" variants={fadeIn} initial="hidden" animate="show" exit="hidden" className="space-y-6">
                {/* ── Targeted Scraper Command Center ───────────────────── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="card-base p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                        <Database size={16} className="text-cyan-500" /> API Sources
                      </h3>
                      <button className="btn-icon" onClick={loadStatuses} title="Refresh Statuses">
                        <RefreshCcw size={14} />
                      </button>
                    </div>
                    <div className="space-y-3">
                      {['api-sports.io', 'football-data.org', 'thesportsdb.com', 'apifootball.com'].map(apiName => {
                        const s = sourceStatuses[apiName] || { status: 'unknown' };
                        const isConnected = s.status === 'connected';
                        const isDisabled = s.status === 'disabled';
                        
                        return (
                          <div key={apiName} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                            <div className="flex items-center gap-3">
                              <span className={isConnected ? 'dot-online' : isDisabled ? 'dot-idle' : 'dot-busy'} />
                              <div>
                                <p className="text-sm font-medium text-foreground">{apiName}</p>
                                <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                  {s.status} {s.latency ? `(${s.latency}ms)` : ''}
                                </p>
                              </div>
                            </div>
                            <button
                              className="btn-primary text-xs px-3 py-1.5"
                              disabled={isDisabled || isScrapingTarget === apiName}
                              onClick={() => triggerTargetedScrape('api', apiName)}
                            >
                              {isScrapingTarget === apiName ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                              Fetch
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="card-base p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                        <Globe size={16} className="text-cyan-500" /> Web Crawl Targets
                      </h3>
                    </div>
                    <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                      {config?.scrapingUrls?.length > 0 ? (
                        config.scrapingUrls.map((url: string) => {
                          const s = sourceStatuses[url] || { status: 'unknown' };
                          const isConnected = s.status === 'connected';
                          
                          return (
                            <div key={url} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                              <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                                <span className={isConnected ? 'dot-online' : 'dot-idle'} />
                                <div className="truncate">
                                  <p className="text-sm font-mono text-foreground truncate">{url}</p>
                                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider">
                                    {s.status} {s.latency ? `(${s.latency}ms)` : ''}
                                  </p>
                                </div>
                              </div>
                              <button
                                className="btn-primary text-xs px-3 py-1.5 shrink-0"
                                disabled={isScrapingTarget === url}
                                onClick={() => triggerTargetedScrape('web', url)}
                              >
                                {isScrapingTarget === url ? <Loader2 size={12} className="animate-spin" /> : <Play size={12} />}
                                Crawl
                              </button>
                            </div>
                          );
                        })
                      ) : (
                        <div className="text-center text-sm text-muted-foreground py-8">
                          No URLs configured. Add them in the 'Scraping Config' tab.
                        </div>
                      )}
                    </div>
                    </div>
                  </div>

                  {/* Latest Intelligence Highlight */}
                  {processedData.length > 0 && (
                    <div className="card-base p-6 bg-amber-500/5 border-amber-500/20">
                      <div className="flex items-start gap-4">
                        <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500">
                          <Brain size={24} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-semibold text-foreground">Latest Processed Intelligence</h4>
                            <span className="text-[10px] text-muted-foreground font-mono">
                              {formatToWAT(processedData[0].createdAt)}
                            </span>
                          </div>
                          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-p:leading-relaxed prose-headings:font-bold prose-a:text-primary mt-2">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {processedData[0].summary}
                            </ReactMarkdown>
                          </div>
                          <div className="mt-3 flex items-center gap-3">
                            <span className="badge badge-purple text-[10px]">
                              {Array.isArray(processedData[0].structuredData) ? processedData[0].structuredData.length : 0} Matches Analyzed
                            </span>
                            <span className="text-[10px] text-muted-foreground italic">
                              Node: Neural Consensus v2.1
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="card-base overflow-hidden">
                  <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                      <Database size={16} className="text-cyan-500" /> Scraped Data Memory
                      {scrapedData.length > 0 && <span className="badge badge-purple">{scrapedData.length} records</span>}
                    </h3>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search teams, league..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && loadScrapedData(1)}
                          className="input-field pl-8 py-1.5 text-xs w-[200px]"
                        />
                      </div>
                      <button className="btn-icon" onClick={() => loadScrapedData()} title="Refresh Data">
                        <RefreshCcw size={14} />
                      </button>
                    </div>
                  </div>

                  {scrapedData.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="data-table text-xs">
                        <thead>
                          <tr>
                            <th>Date/Time</th>
                            <th>Source API</th>
                            <th>Match</th>
                            <th>Odds (1x2)</th>
                            <th>Advanced (BTTS / O/U)</th>
                            <th>Form (Last 5)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scrapedData.map(d => (
                            <tr key={d.id}>
                              <td className="text-muted-foreground whitespace-nowrap">
                                {formatToWAT(d.createdAt)}
                              </td>
                              <td><span className="badge badge-gray">{d.sourceApi}</span></td>
                              <td>
                                <div className="font-medium text-foreground">{d.homeTeam} vs {d.awayTeam}</div>
                                <div className="text-xs text-muted-foreground">{d.league}</div>
                              </td>
                              <td>
                                {d.odds ? (
                                  <div className="flex gap-1.5">
                                    <span className="bg-secondary px-1.5 py-0.5 rounded text-[10px]" title="Home">{d.odds.home?.toFixed(2)}</span>
                                    <span className="bg-secondary px-1.5 py-0.5 rounded text-[10px]" title="Draw">{d.odds.draw?.toFixed(2)}</span>
                                    <span className="bg-secondary px-1.5 py-0.5 rounded text-[10px]" title="Away">{d.odds.away?.toFixed(2)}</span>
                                  </div>
                                ) : 'N/A'}
                              </td>
                              <td>
                                {d.odds ? (
                                  <div className="flex gap-1.5">
                                    {d.odds.btts && <span className="bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded text-[10px]" title="BTTS">B: {d.odds.btts.toFixed(2)}</span>}
                                    {d.odds.over25 && <span className="bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded text-[10px]" title="Over 2.5">O: {d.odds.over25.toFixed(2)}</span>}
                                    {d.odds.under25 && <span className="bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded text-[10px]" title="Under 2.5">U: {d.odds.under25.toFixed(2)}</span>}
                                  </div>
                                ) : '-'}
                              </td>
                              <td>
                                {d.rawStats?.last5 ? (
                                  <div className="flex flex-col gap-1 text-[9px] font-mono leading-none tracking-widest text-muted-foreground">
                                    <span>H: {d.rawStats.last5.home || 'N/A'}</span>
                                    <span>A: {d.rawStats.last5.away || 'N/A'}</span>
                                  </div>
                                ) : '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      
                      {/* Pagination Controls */}
                      {totalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-secondary/10">
                          <span className="text-xs text-muted-foreground">
                            Showing page {page} of {totalPages}
                          </span>
                          <div className="flex gap-2">
                            <button 
                              className="btn-outline text-xs px-3 py-1"
                              disabled={page <= 1}
                              onClick={() => loadScrapedData(page - 1)}
                            >
                              Previous
                            </button>
                            <div className="flex items-center gap-1 mx-2">
                              <span className="text-xs text-muted-foreground">Go to:</span>
                              <input
                                type="number"
                                min="1"
                                max={totalPages}
                                value={pageInput}
                                onChange={(e) => setPageInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const p = parseInt(pageInput, 10);
                                    if (p >= 1 && p <= totalPages) loadScrapedData(p);
                                  }
                                }}
                                className="input-field py-1 px-2 text-xs w-[60px] text-center"
                              />
                            </div>
                            <button 
                              className="btn-outline text-xs px-3 py-1"
                              disabled={page >= totalPages}
                              onClick={() => loadScrapedData(page + 1)}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-6 py-12 text-center text-muted-foreground text-sm">
                      No scraped data found in database. The scraper agent will collect data automatically.
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── Intelligence Processor ────────────────────────── */}
            {active === 'processor' && (
              <motion.div key="processor" variants={fadeIn} initial="hidden" animate="show" exit="hidden" className="space-y-6">
                <div className="card-base overflow-hidden">
                  <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                      <Brain size={16} className="text-amber-500" /> Intelligence Storage
                      {processedData.length > 0 && <span className="badge badge-purple">{processedData.length} entries</span>}
                    </h3>
                    <div className="flex items-center gap-2">
                      <button 
                        className="btn-primary text-xs px-3 py-1.5" 
                        onClick={triggerProcessing}
                        disabled={isProcessing}
                      >
                        {isProcessing ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                        Run Processor
                      </button>
                      <button 
                        className="btn-ghost text-xs px-3 py-1.5 text-destructive hover:bg-destructive/10" 
                        onClick={cleanOldData}
                        disabled={isCleaning}
                      >
                        {isCleaning ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                        Clean Old Data
                      </button>
                      <button className="btn-icon" onClick={loadProcessedData}>
                        <RefreshCcw size={14} />
                      </button>
                    </div>
                  </div>

                  {processedData.length > 0 ? (
                    <div className="p-6 space-y-4 max-h-[800px] overflow-y-auto">
                      {processedData.map(d => (
                        <div key={d.id} className="p-5 rounded-xl border border-border bg-secondary/10 hover:border-primary/30 transition-colors">
                          <div className="flex justify-between items-start mb-3">
                            <span className="text-xs font-mono text-muted-foreground bg-secondary/50 px-2 py-1 rounded">
                              {formatToWAT(d.createdAt)}
                            </span>
                            <span className="badge badge-purple">
                              {Array.isArray(d.structuredData) ? d.structuredData.length : 'Object'} Items Processed
                            </span>
                          </div>
                          <div className="prose prose-sm dark:prose-invert max-w-none text-foreground prose-p:leading-relaxed prose-headings:font-bold prose-a:text-primary">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {d.summary}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-6 py-12 text-center text-muted-foreground text-sm">
                      No processed intelligence found. Run the Processor Agent to organize raw scraped data.
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── History ──────────────────────────────────────── */}
            {active === 'history' && (
              <motion.div key="history" variants={fadeIn} initial="hidden" animate="show" exit="hidden" className="space-y-6">
                <div className="card-base overflow-hidden">
                  <div className="px-6 py-4 border-b border-border flex items-center justify-between">
                    <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                      <History size={16} className="text-emerald-500" />
                      Prediction Performance & Learning
                      {history.length > 0 && (
                        <span className="badge badge-green">{history.length}</span>
                      )}
                    </h3>
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search status..."
                          value={historySearch}
                          onChange={(e) => setHistorySearch(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && loadHistory(1)}
                          className="input-field pl-8 py-1.5 text-xs w-[150px]"
                        />
                      </div>
                      <button className="btn-icon" onClick={() => loadHistory()}>
                        <RefreshCcw size={14} />
                      </button>
                    </div>
                  </div>

                  {history.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Timestamp</th>
                            <th>Target</th>
                            <th>Confidence</th>
                            <th>Outcome</th>
                            <th>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map(slip => (
                            <tr key={slip.id} className="group hover:bg-secondary/20 transition-colors">
                              <td className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                                {formatToWAT(slip.createdAt)}
                              </td>
                              <td>
                                <span className="badge badge-purple">{slip.targetOdds}×</span>
                              </td>
                              <td>
                                <div className="flex items-center gap-3">
                                  <div className="progress-bar w-16">
                                    <div className="progress-fill" style={{ width: `${slip.confidence}%` }} />
                                  </div>
                                  <span className="text-xs font-semibold text-foreground">{slip.confidence}%</span>
                                </div>
                              </td>
                              <td>
                                <span className={`badge ${
                                  slip.status === 'WON' ? 'badge-green' :
                                  slip.status === 'LOST' ? 'badge-red' : 'badge-amber'
                                }`}>
                                  {slip.status || 'PENDING'}
                                </span>
                              </td>
                              <td>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => setSelectedSlip(slip)}
                                    className="p-1 rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                                    title="View Details"
                                  >
                                    <Eye size={14} />
                                  </button>
                                  <button
                                    onClick={() => updateSlipStatus(slip.id, 'WON')}
                                    className="p-1 rounded bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-colors"
                                    title="Mark as Won"
                                  >
                                    <Check size={14} />
                                  </button>
                                  <button
                                    onClick={() => updateSlipStatus(slip.id, 'LOST')}
                                    className="p-1 rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                                    title="Mark as Lost"
                                  >
                                    <X size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>

                      {/* History Pagination */}
                      {historyTotalPages > 1 && (
                        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-secondary/10">
                          <span className="text-xs text-muted-foreground">
                            Showing page {historyPage} of {historyTotalPages}
                          </span>
                          <div className="flex gap-2">
                            <button 
                              className="btn-outline text-xs px-3 py-1"
                              disabled={historyPage <= 1}
                              onClick={() => loadHistory(historyPage - 1)}
                            >
                              Previous
                            </button>
                            <div className="flex items-center gap-1 mx-2">
                              <span className="text-xs text-muted-foreground">Go to:</span>
                              <input
                                type="number"
                                min="1"
                                max={historyTotalPages}
                                value={historyPageInput}
                                onChange={(e) => setHistoryPageInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    const p = parseInt(historyPageInput, 10);
                                    if (p >= 1 && p <= historyTotalPages) loadHistory(p);
                                  }
                                }}
                                className="input-field py-1 px-2 text-xs w-[60px] text-center"
                              />
                            </div>
                            <button 
                              className="btn-outline text-xs px-3 py-1"
                              disabled={historyPage >= historyTotalPages}
                              onClick={() => loadHistory(historyPage + 1)}
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="px-6 py-12 text-center text-muted-foreground text-sm">
                      No prediction history yet. Generate slips from the dashboard to see logs here.
                    </div>
                  )}
                </div>

                {/* Detailed Slip View (Modal) */}
                <AnimatePresence>
                  {selectedSlip && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="card-base w-full max-w-2xl overflow-hidden shadow-2xl"
                      >
                        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-secondary/20">
                          <div>
                            <h3 className="font-bold text-foreground">Slip Details</h3>
                            <p className="text-[10px] text-muted-foreground font-mono">{selectedSlip.id}</p>
                          </div>
                          <button onClick={() => setSelectedSlip(null)} className="p-2 hover:bg-secondary rounded-lg transition-colors">
                            <X size={18} />
                          </button>
                        </div>
                        <div className="p-6 overflow-y-auto max-h-[70vh]">
                          <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className="p-4 rounded-xl bg-secondary/30 border border-border">
                              <p className="section-label">Target Odds</p>
                              <p className="text-2xl font-black text-foreground">{selectedSlip.targetOdds}×</p>
                            </div>
                            <div className="p-4 rounded-xl bg-secondary/30 border border-border">
                              <p className="section-label">Confidence Score</p>
                              <p className="text-2xl font-black text-foreground">{selectedSlip.confidence}%</p>
                            </div>
                          </div>

                          <h4 className="section-label mb-3">Matches Included</h4>
                          <div className="space-y-3">
                            {(Array.isArray(selectedSlip.matches) ? selectedSlip.matches : []).map((m: any, i: number) => (
                              <div key={i} className="p-4 rounded-xl border border-border hover:border-primary/30 transition-colors">
                                <div className="flex justify-between items-start mb-2">
                                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{m.league}</span>
                                  <span className="badge badge-purple">{m.odds}</span>
                                </div>
                                <div className="flex justify-between items-center font-display font-bold text-foreground">
                                  <span>{m.homeTeam}</span>
                                  <span className="text-muted-foreground font-normal mx-2">vs</span>
                                  <span>{m.awayTeam}</span>
                                </div>
                                <div className="mt-2 flex items-center justify-between">
                                  <span className="text-xs text-primary font-bold">{m.selection}</span>
                                  <span className="text-[10px] text-muted-foreground italic">{m.reasoning}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="px-6 py-4 border-t border-border bg-secondary/10 flex justify-end gap-3">
                          <button onClick={() => setSelectedSlip(null)} className="btn-ghost">Close</button>
                          <div className="flex gap-1">
                            <button
                              onClick={() => { updateSlipStatus(selectedSlip.id, 'WON'); setSelectedSlip(null); }}
                              className="btn-primary bg-emerald-500 hover:bg-emerald-600 border-none"
                            >
                              WON
                            </button>
                            <button
                              onClick={() => { updateSlipStatus(selectedSlip.id, 'LOST'); setSelectedSlip(null); }}
                              className="btn-primary bg-destructive hover:bg-destructive/90 border-none"
                            >
                              LOST
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </AnimatePresence>

                <div className="card-base p-6 bg-primary/5 border-primary/20">
                  <div className="flex items-start gap-4">
                    <div className="p-3 rounded-xl bg-primary/10 text-primary">
                      <Brain size={24} />
                    </div>
                    <div>
                      <h4 className="font-semibold text-foreground">Self-Learning Active</h4>
                      <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                        By marking outcomes above, you provide vital feedback to the neural agents. 
                        The Analyst Agent automatically adjusts weights for the next generation based on your actual win/loss data.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── Security ─────────────────────────────────────── */}
            {active === 'security' && (
              <motion.div key="security" variants={fadeIn} initial="hidden" animate="show" exit="hidden" className="space-y-6">
                <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">Security Notice</p>
                    <p className="text-xs text-amber-600/80 dark:text-amber-400/80 mt-0.5">
                      Credentials are encrypted. Test connections after updating to ensure the system remains operational.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Football APIs */}
                  <div className="card-base overflow-hidden h-fit">
                    <div className="px-6 py-4 border-b border-border">
                      <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                        <Globe size={16} className="text-cyan-500" /> Football Data Vault
                      </h3>
                    </div>
                    <div className="p-6 space-y-6">
                      {FOOTBALL_PROVIDERS.map((provider) => (
                        <div key={provider.id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="section-label">{provider.name} Key</label>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => testConnection('football', provider.id, config?.footballApis?.[provider.id]?.apiKey)}
                                disabled={testing[`football-${provider.id}`] || !config?.footballApis?.[provider.id]?.apiKey}
                                className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border border-border hover:border-primary transition-colors flex items-center gap-1.5"
                              >
                                {testing[`football-${provider.id}`] ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                                Test
                              </button>
                              {testRes[`football-${provider.id}`] && (
                                <span className={`text-[10px] font-bold ${testRes[`football-${provider.id}`].success ? 'text-emerald-500' : 'text-destructive'}`}>
                                  {testRes[`football-${provider.id}`].success ? 'PASS' : 'FAIL'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="relative">
                            <input
                              type={showKey[`football-${provider.id}`] ? 'text' : 'password'}
                              value={config?.footballApis?.[provider.id]?.apiKey || ''}
                              onChange={e => {
                                const u = { ...config.footballApis, [provider.id]: { ...config.footballApis[provider.id], apiKey: e.target.value } };
                                setConfig({ ...config, footballApis: u });
                              }}
                              className="form-input pr-10 text-xs"
                              placeholder={`${provider.name} Key`}
                              autoComplete="new-password"
                            />
                            <button
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => setShowKey(prev => ({ ...prev, [`football-${provider.id}`]: !prev[`football-${provider.id}`] }))}
                            >
                              {showKey[`football-${provider.id}`] ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                          {testRes[`football-${provider.id}`] && !testRes[`football-${provider.id}`].success && (
                            <p className="text-[10px] text-destructive mt-1">{testRes[`football-${provider.id}`].msg}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* AI APIs */}
                  <div className="card-base overflow-hidden h-fit">
                    <div className="px-6 py-4 border-b border-border">
                      <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">
                        <Zap size={16} className="text-primary" /> Neural Intelligence Vault
                      </h3>
                    </div>
                    <div className="p-6 space-y-6">
                      {['gemini', 'mistral', 'openrouter', 'grok'].map(id => (
                        <div key={id} className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="section-label capitalize">{id === 'openrouter' ? 'OpenRouter' : id} Access Key</label>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => testConnection('ai', id, config?.aiProviders?.[id]?.apiKey)}
                                disabled={testing[`ai-${id}`] || !config?.aiProviders?.[id]?.apiKey}
                                className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border border-border hover:border-primary transition-colors flex items-center gap-1.5"
                              >
                                {testing[`ai-${id}`] ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                                Test
                              </button>
                              {testRes[`ai-${id}`] && (
                                <span className={`text-[10px] font-bold ${testRes[`ai-${id}`].success ? 'text-emerald-500' : 'text-destructive'}`}>
                                  {testRes[`ai-${id}`].success ? 'PASS' : 'FAIL'}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="relative">
                            <input
                              type={showKey[id] ? 'text' : 'password'}
                              value={config?.aiProviders?.[id]?.apiKey || ''}
                              onChange={e => {
                                const u = { ...config.aiProviders, [id]: { ...config.aiProviders[id], apiKey: e.target.value } };
                                setConfig({ ...config, aiProviders: u });
                              }}
                              className="form-input pr-10 text-xs"
                              placeholder={`${id === 'openrouter' ? 'OpenRouter' : id} Neural Key`}
                              autoComplete="new-password"
                            />
                            <button
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                              onClick={() => setShowKey(prev => ({ ...prev, [id]: !prev[id] }))}
                            >
                              {showKey[id] ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                          </div>
                          
                          {/* Model selection for AI providers */}
                          {(id === 'gemini' || id === 'mistral' || id === 'openrouter') && (
                            <div className="mt-3 space-y-1.5">
                              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">Active Model</label>
                              <input
                                type="text"
                                value={config?.aiProviders?.[id]?.model || ''}
                                onChange={e => {
                                  const u = { ...config.aiProviders, [id]: { ...config.aiProviders[id], model: e.target.value } };
                                  setConfig({ ...config, aiProviders: u });
                                }}
                                className="form-input text-xs"
                                placeholder={`e.g. ${id === 'gemini' ? 'gemini-2.0-flash' : id === 'mistral' ? 'mistral-large-latest' : 'google/gemini-2.0-flash-001'}`}
                              />
                              <p className="text-[10px] text-muted-foreground/60 italic">
                                {id === 'gemini' ? 'Use "gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash"' : 
                                 id === 'mistral' ? 'Use "mistral-large-latest", "open-mixtral-8x22b"' : 
                                 'Use "google/gemini-2.0-flash-001", "anthropic/claude-3-sonnet"'}
                              </p>
                            </div>
                          )}

                          {testRes[`ai-${id}`] && !testRes[`ai-${id}`].success && (
                            <p className="text-[10px] text-destructive mt-1">{testRes[`ai-${id}`].msg}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
