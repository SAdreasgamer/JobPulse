/**
 * UserProfileSetup — modal for the user to enter their skills/experience.
 * This data is sent to PUT /api/ai/profile and used by all AI features.
 * Shows automatically on first visit (no profile saved yet).
 */
import { useEffect, useState } from "react";
import { X, Save, Sparkles } from "lucide-react";
import { toast } from "../lib/toast";

const API_BASE = "http://localhost:3456/api";

interface UserProfile {
  name: string;
  title: string;
  skills: string[];
  years_experience: number;
  summary: string;
  target_roles: string[];
}

const EMPTY: UserProfile = {
  name: "",
  title: "",
  skills: [],
  years_experience: 0,
  summary: "",
  target_roles: [],
};

interface Props {
  onClose: () => void;
}

export function UserProfileSetup({ onClose }: Props) {
  const [profile, setProfile] = useState<UserProfile>(EMPTY);
  const [skillsText, setSkillsText] = useState("");
  const [rolesText, setRolesText] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/ai/profile`)
      .then((r) => r.json())
      .then((p: UserProfile) => {
        setProfile(p);
        setSkillsText(p.skills.join(", "));
        setRolesText(p.target_roles.join(", "));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const payload: UserProfile = {
        ...profile,
        skills: skillsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        target_roles: rolesText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      await fetch(`${API_BASE}/ai/profile`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast.info("Profile saved — AI features will use your updated info.");
      onClose();
    } catch (e) {
      toast.error(`Failed to save profile: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg bg-surface rounded-xl shadow-2xl border border-line overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-6 py-4 border-b border-line">
          <Sparkles size={16} className="text-violet-500" />
          <h2 className="text-base font-semibold text-ink flex-1">Your AI Profile</h2>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink rounded p-1"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <p className="text-xs text-ink-muted">
            This profile is stored locally and used by phi3.5 to score job fit, generate cover
            letters, and suggest whether to apply. Your data never leaves your machine.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">Your name</label>
              <input
                type="text"
                value={profile.name}
                onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                placeholder="Jane Doe"
                className="w-full text-sm px-3 py-2 rounded border border-line bg-surface text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Current / target title
              </label>
              <input
                type="text"
                value={profile.title}
                onChange={(e) => setProfile((p) => ({ ...p, title: e.target.value }))}
                placeholder="Software Engineer"
                className="w-full text-sm px-3 py-2 rounded border border-line bg-surface text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-violet-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">Years of experience</label>
            <input
              type="number"
              min={0}
              value={profile.years_experience}
              onChange={(e) =>
                setProfile((p) => ({ ...p, years_experience: Number(e.target.value) }))
              }
              className="w-24 text-sm px-3 py-2 rounded border border-line bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              Skills <span className="text-ink-muted font-normal">(comma-separated)</span>
            </label>
            <textarea
              value={skillsText}
              onChange={(e) => setSkillsText(e.target.value)}
              placeholder="Python, FastAPI, React, TypeScript, PostgreSQL, Docker…"
              rows={2}
              className="w-full text-sm px-3 py-2 rounded border border-line bg-surface text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">Professional summary</label>
            <textarea
              value={profile.summary}
              onChange={(e) => setProfile((p) => ({ ...p, summary: e.target.value }))}
              placeholder="2-3 sentences about your background and what you're looking for…"
              rows={3}
              className="w-full text-sm px-3 py-2 rounded border border-line bg-surface text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-ink mb-1">
              Target roles <span className="text-ink-muted font-normal">(comma-separated)</span>
            </label>
            <input
              type="text"
              value={rolesText}
              onChange={(e) => setRolesText(e.target.value)}
              placeholder="Software Engineer, AI Engineer, Full Stack Developer…"
              className="w-full text-sm px-3 py-2 rounded border border-line bg-surface text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-line">
          <button
            onClick={onClose}
            className="text-sm px-4 py-2 rounded text-ink-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving || !loaded}
            className="flex items-center gap-2 text-sm px-4 py-2 rounded bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
          >
            <Save size={14} />
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
