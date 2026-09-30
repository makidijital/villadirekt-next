"use client";

import { useEffect, useMemo, useState } from "react";
/* 🛡️ Migration AU-P2 — list/update/toggle artık server route handler'ları
   üzerinden (native, RLS-free + authorizeAdminCaller). create/delete +
   SIDEBAR_PERMISSIONS (client-safe value) + type'lar service'te KALIR
   (dokunulmadı). */
import {
  createAdminUser,
  deleteAdminUser,
  SIDEBAR_PERMISSIONS,
  type AdminUser,
  type AdminUserInput,
  type PermissionItem,
} from "@/app/services/admin-user.service";
import { adminFetch } from "@/lib/admin-fetch";
import {
  Plus,
  Search,
  RefreshCw,
  Trash2,
  Pencil,
  Power,
  Mail as MailIcon,
  X,
  Save,
  Loader2,
  KeyRound,
  ShieldCheck,
  ShieldOff,
  Lock,
  Copy,
  Check,
  User as UserIcon,
} from "lucide-react";
import {
  useNotify,
  useConfirm,
} from "@/app/components/admin/notifications/NotificationProvider";
import { logActivity } from "@/lib/activity-log.client";
/* 🛡️ TOTP 2FA — eski /maki-admin/hesabim'den taşındı. `useAdmin()`
   yalnız "bu satır BENİM satırım mı" (admin.id === u.id) client-side
   UI kararı + kendi totp_enabled durumunu (context) taze tutmak için
   kullanılır. GERÇEK yetki sınırı HER ZAMAN server'dadır: aşağıdaki
   handler'ların çağırdığı /api/admin/2fa/* route'ları hiçbirinde
   body'den target admin id okunmaz — hepsi authorizeAdminSession()'ın
   döndürdüğü ÇAĞIRANIN kendi session'ı (caller.id/caller.email)
   üzerinden çalışır. Bu import/kontrol o server sınırının ÜSTÜNE
   eklenen bir UI filtresidir, ONUN YERİNE GEÇMEZ. */
import { useAdmin } from "@/app/components/admin/AdminSessionGuard";

/* ===============================================================
   🔥 ADMIN USERS — multi-user yönetim paneli
   ===============================================================
   - Liste: avatar, ad soyad, email, status, oluşturulma
   - Filtre + arama
   - Yeni kullanıcı / düzenle modal
   - Sidebar permission checkbox grid
   - Aktif/pasif toggle, sil
   - Sadece foundation; mevcut auth yapısı dokunulmadı
   =============================================================== */

/* 🛡️ Central helper (manual UTC→Istanbul math, Intl-bypass-proof). */
import { formatDateTimeTr } from "@/lib/date-format";
/* 🐛 FIX — /maki-admin/villas aramasıyla aynı Türkçe-tolerant normalize. */
import { normalizeSearchText } from "@/lib/search";

function formatDateTime(value?: string | null) {
  return formatDateTimeTr(value);
}

/* ===============================================================
   🛡️ AU-P2 — CLIENT ROUTE-HANDLER WRAPPERS (list/update/toggle)
   ===============================================================
   Anon `admin-user.service` yerine `adminFetch` (Bearer) ile server
   route'ları çağırır. Dönüş sözleşmeleri service ile BYTE-IDENTICAL →
   call-site'lar (load / handleSave / handleToggleActive) DEĞİŞMEZ.
   Authorization route boundary'de (`authorizeAdminCaller`); native twin
   RLS-free. Payload normalize route handler'da (service ile birebir).
   =============================================================== */
async function getAdminUsers(): Promise<AdminUser[]> {
  try {
    const res = await adminFetch("/api/admin-users");
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      users?: AdminUser[];
      error?: string;
    };
    if (!res.ok || !json?.ok) {
      console.error("❌ getAdminUsers:", json?.error ?? res.statusText);
      return [];
    }
    return json.users || [];
  } catch (err) {
    console.error(
      "❌ getAdminUsers:",
      err instanceof Error ? err.message : err
    );
    return [];
  }
}

async function updateAdminUser(
  id: string,
  input: Partial<AdminUserInput>
): Promise<{ ok: boolean; error?: string }> {
  if (!id) return { ok: false, error: "id gerekli" };
  try {
    const res = await adminFetch(
      `/api/admin-users/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }
    );
    const json = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
    };
    if (!res.ok || !json?.ok) {
      return {
        ok: false,
        error: json?.error || res.statusText || "Güncellenemedi",
      };
    }
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Bilinmeyen hata",
    };
  }
}

async function setAdminUserActive(
  id: string,
  active: boolean
): Promise<boolean> {
  if (!id) return false;
  try {
    const res = await adminFetch(
      `/api/admin-users/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: active }),
      }
    );
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean };
    return res.ok && json?.ok === true;
  } catch (err) {
    console.error(
      "❌ setAdminUserActive:",
      err instanceof Error ? err.message : err
    );
    return false;
  }
}

type StatusFilter = "all" | "active" | "inactive";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "Tümü" },
  { key: "active", label: "Aktif" },
  { key: "inactive", label: "Pasif" },
];

/* 🛡️ TOTP 2FA — eski /maki-admin/hesabim'den BİREBİR taşınan tip/sabit
   (bkz. dosya sonundaki modal + yukarıdaki handler bloğu). */
type TwoFaView =
  | "status"
  | "enroll"
  | "recovery-reveal"
  | "disable"
  | "regenerate";

type EnrollState = {
  secret: string;
  otpauthUri: string;
  qrDataUrl: string;
};

const TWO_FA_SOFT_BG = "rgba(15, 23, 42, 0.04)";

/* group SIDEBAR_PERMISSIONS by group label (display order korunur) */
function groupPermissions(items: PermissionItem[]) {
  const map = new Map<string, PermissionItem[]>();
  items.forEach((p) => {
    if (!map.has(p.group)) map.set(p.group, []);
    map.get(p.group)!.push(p);
  });
  return Array.from(map.entries()).map(([group, list]) => ({
    group,
    list,
  }));
}

export default function AdminUsersPage() {
  const toast = useNotify();
  const confirm = useConfirm();
  /* 🛡️ TOTP 2FA — current admin id (client-side UI filtresi; gerçek
     yetki sınırı server'da — bkz. import block'taki not). */
  const { admin: currentAdmin, refresh: refreshCurrentAdmin } = useAdmin();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  /* 🛡️ TOTP 2FA — kendi 2FA yönetim modal state'i (eski
     /maki-admin/hesabim'den BİREBİR taşındı). */
  const [twoFaOpen, setTwoFaOpen] = useState(false);
  const [twoFaView, setTwoFaView] = useState<TwoFaView>("status");
  const [twoFaBusy, setTwoFaBusy] = useState(false);
  const [enroll, setEnroll] = useState<EnrollState | null>(null);
  const [enrollCode, setEnrollCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [reauthMode, setReauthMode] = useState<"password" | "code">(
    "password"
  );
  const [reauthValue, setReauthValue] = useState("");

  // modal state
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState<AdminUserInput>({
    full_name: "",
    email: "",
    password: "",
    sidebar_permissions: [],
    is_active: true,
  });

  async function load(initial = false) {
    if (initial) setLoading(true);
    else setRefreshing(true);
    const data = await getAdminUsers();
    setUsers(data);
    if (initial) setLoading(false);
    else setRefreshing(false);
  }

  useEffect(() => {
    load(true);
  }, []);

  /* ---------------- FILTER ---------------- */
  const filtered = useMemo(() => {
    const q = normalizeSearchText(search);
    return users.filter((u) => {
      if (statusFilter === "active" && !u.is_active) return false;
      if (statusFilter === "inactive" && u.is_active) return false;
      if (!q) return true;
      return (
        normalizeSearchText(u.full_name || "").includes(q) ||
        normalizeSearchText(u.email || "").includes(q)
      );
    });
  }, [users, search, statusFilter]);

  /* ---------------- MODAL HELPERS ---------------- */
  function openCreate() {
    setEditingId(null);
    setFormError(null);
    setForm({
      full_name: "",
      email: "",
      password: "",
      sidebar_permissions: SIDEBAR_PERMISSIONS.map((p) => p.key), // default: tüm yetkiler
      is_active: true,
    });
    setOpen(true);
  }

  function openEdit(u: AdminUser) {
    setEditingId(u.id);
    setFormError(null);
    setForm({
      full_name: u.full_name || "",
      email: u.email || "",
      password: "",
      sidebar_permissions: Array.isArray(u.sidebar_permissions)
        ? u.sidebar_permissions
        : [],
      is_active: u.is_active !== false,
    });
    setOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setOpen(false);
    setEditingId(null);
    setFormError(null);
  }

  function togglePerm(key: string, checked: boolean) {
    setForm((prev) => {
      const set = new Set(prev.sidebar_permissions || []);
      if (checked) set.add(key);
      else set.delete(key);
      return {
        ...prev,
        sidebar_permissions: Array.from(set),
      };
    });
  }

  function selectAllPerms(group?: string) {
    setForm((prev) => {
      const set = new Set(prev.sidebar_permissions || []);
      SIDEBAR_PERMISSIONS.forEach((p) => {
        if (!group || p.group === group) set.add(p.key);
      });
      return { ...prev, sidebar_permissions: Array.from(set) };
    });
  }

  function clearAllPerms(group?: string) {
    setForm((prev) => {
      const set = new Set(prev.sidebar_permissions || []);
      SIDEBAR_PERMISSIONS.forEach((p) => {
        if (!group || p.group === group) set.delete(p.key);
      });
      return { ...prev, sidebar_permissions: Array.from(set) };
    });
  }

  /* ---------------- SAVE ---------------- */
  async function handleSave() {
    setFormError(null);
    setSaving(true);
    try {
      if (editingId) {
        /* 🛡️ FAZ 55I — BEFORE snapshot (audit log diff için).
           Mevcut `users` state'inden editingId ile bul; password
           hiç tutulmadığı için snapshot'a girmez. */
        const beforeUser = users.find((u) => u.id === editingId);
        const res = await updateAdminUser(editingId, form);
        if (!res.ok) {
          setFormError(res.error || "Güncellenemedi");
          return;
        }
        /* AUDIT LOG (fail-safe) — sensitive password helper masking
           ile zaten redact edilir; ek olarak after_data'ya hiç eklemiyoruz. */
        if (beforeUser) {
          logActivity({
            action: "admin.updated",
            entity_type: "admin_user",
            entity_id: editingId,
            entity_title: form.email || beforeUser.email || editingId,
            before_data: {
              full_name: beforeUser.full_name,
              email: beforeUser.email,
              sidebar_permissions: Array.isArray(beforeUser.sidebar_permissions)
                ? beforeUser.sidebar_permissions
                : [],
              is_active: beforeUser.is_active,
            },
            after_data: {
              full_name: form.full_name,
              email: form.email,
              sidebar_permissions: form.sidebar_permissions,
              is_active: form.is_active,
            },
          }).catch(() => {});
        }
      } else {
        /* CREATE — server-side endpoint zaten "admin.created" log
           insert eder (extractAdminContextFromRequest). Client log
           DUPLICATE olur, eklenmiyor. */
        const res = await createAdminUser(form);
        if (!res.ok) {
          setFormError(res.error || "Oluşturulamadı");
          return;
        }
      }
      setOpen(false);
      setEditingId(null);
      await load(false);
    } finally {
      setSaving(false);
    }
  }

  /* ---------------- ACTIONS ---------------- */
  async function handleToggleActive(u: AdminUser) {
    const nextActive = !u.is_active;
    const ok = await setAdminUserActive(u.id, nextActive);
    if (ok) {
      /* 🛡️ FAZ 55I — Toggle log; admin.updated sub-case with single
         is_active diff. Fail-safe. */
      logActivity({
        action: "admin.updated",
        entity_type: "admin_user",
        entity_id: u.id,
        entity_title: u.email || u.id,
        before_data: { is_active: u.is_active },
        after_data: { is_active: nextActive },
      }).catch(() => {});
      await load(false);
    }
  }

  async function handleDelete(u: AdminUser) {
    const proceed = await confirm({
      title: "Kullanıcı silinsin mi?",
      description: `"${u.full_name || u.email}" kaldırılır. Bu işlem geri alınamaz.`,
      confirmLabel: "Sil",
      variant: "danger",
    });
    if (!proceed) return;
    const ok = await deleteAdminUser(u.id);
    if (ok) {
      await load(false);
      toast.success("Kullanıcı silindi", { id: `user-delete-${u.id}` });
    } else {
      toast.error("Silinemedi", { id: `user-delete-${u.id}` });
    }
  }

  /* ---------------------------------------------------------------
     🛡️ TOTP 2FA — kendi hesabı yönetimi (eski /maki-admin/hesabim'den
     BİREBİR taşındı — akış/endpoint/body/response şekli DEĞİŞMEDİ).
     ---------------------------------------------------------------
     GÜVENLİK: `/api/admin/2fa/enroll/start`, `/enroll/confirm`,
     `/disable`, `/recovery-codes/regenerate` HİÇBİRİ body'de bir
     "target admin id" ALMAZ — hepsi `authorizeAdminSession()`'ın
     döndürdüğü ÇAĞIRANIN OWN session'ı (`caller.id`/`caller.email`)
     üzerinden çalışır (bkz. ilgili route dosyaları — bu turda hiç
     dokunulmadı). Bu yüzden bu handler'lar HANGİ satırdan
     tetiklendiğine bakılmaksızın YALNIZ giriş yapmış adminin kendi
     2FA'sını etkiler — buton yalnız kendi satırında gösterilse de
     (aşağıda `u.id === currentAdmin?.id`), asıl güvenlik sınırı
     burada değil, server'dadır.
  --------------------------------------------------------------- */
  const resetTwoFaReauth = (): void => {
    setReauthMode("password");
    setReauthValue("");
  };

  const parseTwoFaJson = async (
    res: Response
  ): Promise<{ ok?: boolean; error?: string; [k: string]: unknown } | null> => {
    try {
      return await res.json();
    } catch {
      return null;
    }
  };

  function openTwoFaModal(): void {
    setTwoFaView("status");
    setEnroll(null);
    setEnrollCode("");
    setRecoveryCodes([]);
    resetTwoFaReauth();
    setTwoFaOpen(true);
  }

  function closeTwoFaModal(): void {
    if (twoFaBusy) return;
    setTwoFaOpen(false);
  }

  const handleStartEnroll = async (): Promise<void> => {
    setTwoFaBusy(true);
    try {
      const res = await adminFetch("/api/admin/2fa/enroll/start", {
        method: "POST",
      });
      const json = await parseTwoFaJson(res);
      if (!res.ok || !json?.ok) {
        toast.error((json?.error as string) || "2FA kurulumu başlatılamadı");
        return;
      }
      setEnroll({
        secret: (json.secret as string) || "",
        otpauthUri: (json.otpauthUri as string) || "",
        qrDataUrl: (json.qrDataUrl as string) || "",
      });
      setEnrollCode("");
      setTwoFaView("enroll");
    } catch {
      toast.error("Sunucuya ulaşılamadı");
    } finally {
      setTwoFaBusy(false);
    }
  };

  const handleConfirmEnroll = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    if (!/^\d{6}$/.test(enrollCode.trim())) {
      toast.error("6 haneli kodu eksiksiz gir.");
      return;
    }
    setTwoFaBusy(true);
    try {
      const res = await adminFetch("/api/admin/2fa/enroll/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: enrollCode.trim() }),
      });
      const json = await parseTwoFaJson(res);
      if (!res.ok || !json?.ok) {
        toast.error((json?.error as string) || "Geçersiz doğrulama kodu");
        return;
      }
      setRecoveryCodes((json.recoveryCodes as string[]) || []);
      setEnroll(null);
      setTwoFaView("recovery-reveal");
      await refreshCurrentAdmin();
      await load(false);
      toast.success("2FA etkinleştirildi.");
    } catch {
      toast.error("Sunucuya ulaşılamadı");
    } finally {
      setTwoFaBusy(false);
    }
  };

  const handleDisableTwoFa = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    if (!reauthValue.trim()) {
      toast.error(reauthMode === "password" ? "Şifre gerekli" : "Kod gerekli");
      return;
    }
    setTwoFaBusy(true);
    try {
      const res = await adminFetch("/api/admin/2fa/disable", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          reauthMode === "password"
            ? { password: reauthValue.trim() }
            : { code: reauthValue.trim() }
        ),
      });
      const json = await parseTwoFaJson(res);
      if (!res.ok || !json?.ok) {
        toast.error((json?.error as string) || "2FA kapatılamadı");
        return;
      }
      resetTwoFaReauth();
      setTwoFaView("status");
      await refreshCurrentAdmin();
      await load(false);
      toast.success("2FA kapatıldı.");
    } catch {
      toast.error("Sunucuya ulaşılamadı");
    } finally {
      setTwoFaBusy(false);
    }
  };

  const handleRegenerateRecovery = async (
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> => {
    e.preventDefault();
    if (!reauthValue.trim()) {
      toast.error(reauthMode === "password" ? "Şifre gerekli" : "Kod gerekli");
      return;
    }
    setTwoFaBusy(true);
    try {
      const res = await adminFetch(
        "/api/admin/2fa/recovery-codes/regenerate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            reauthMode === "password"
              ? { password: reauthValue.trim() }
              : { code: reauthValue.trim() }
          ),
        }
      );
      const json = await parseTwoFaJson(res);
      if (!res.ok || !json?.ok) {
        toast.error((json?.error as string) || "Kurtarma kodları yenilenemedi");
        return;
      }
      resetTwoFaReauth();
      setRecoveryCodes((json.recoveryCodes as string[]) || []);
      setTwoFaView("recovery-reveal");
      toast.success("Kurtarma kodları yenilendi.");
    } catch {
      toast.error("Sunucuya ulaşılamadı");
    } finally {
      setTwoFaBusy(false);
    }
  };

  const handleCopySecret = async (): Promise<void> => {
    if (!enroll) return;
    try {
      await navigator.clipboard.writeText(enroll.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      /* clipboard erişimi yoksa sessizce yok say — secret zaten ekranda görünür */
    }
  };

  /* ---------------- RENDER ---------------- */
  const groupedPerms = useMemo(
    () => groupPermissions(SIDEBAR_PERMISSIONS),
    []
  );

  return (
    <div className="space-y-10 w-full">
      {/* PAGE HEADER */}
      <header className="admin-page-header">
        <div>
          <p className="admin-page-eyebrow">Sistem</p>
          <h1 className="admin-page-header__title flex items-center gap-2.5">
            <UserIcon
              size={22}
              className="text-[var(--admin-accent-strong)]"
            />
            Kullanıcılar
          </h1>
          <p className="admin-page-header__sub">
            Admin paneline erişimi olan kullanıcıları yönet. Her kullanıcının
            sidebar görünürlüğü ayrı kontrol edilir.
          </p>
        </div>
        <div className="admin-page-header__actions">
          <button
            type="button"
            onClick={() => load(false)}
            disabled={refreshing}
            className="admin-btn-ghost"
          >
            <RefreshCw
              size={14}
              className={refreshing ? "animate-spin" : ""}
            />
            Yenile
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="admin-btn-primary"
          >
            <Plus size={15} />
            Yeni kullanıcı
          </button>
        </div>
      </header>

      {/* FILTER BAR */}
      <div className="admin-filter-bar">
        <div className="admin-pill-search">
          <Search size={14} className="text-[var(--admin-muted-2)]" />
          <input
            placeholder="Ad veya e-posta ara…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setStatusFilter(f.key)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition ${
                  active
                    ? "bg-[var(--admin-text)] text-white border-[var(--admin-text)]"
                    : "bg-[var(--admin-surface)] text-[var(--admin-muted)] border-[var(--admin-border)] hover:border-[var(--admin-border-strong)] hover:text-[var(--admin-text)]"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
        <span className="text-[12px] text-[var(--admin-muted-2)] px-2 ml-auto">
          {filtered.length} kayıt
        </span>
      </div>

      {/* LIST */}
      {loading && (
        <div className="admin-card-flat p-12 text-center text-[var(--admin-muted)]">
          Yükleniyor…
        </div>
      )}

      {!loading && filtered.length === 0 && (
        <div className="admin-card-flat p-14 text-center">
          <div className="w-12 h-12 rounded-full bg-[var(--admin-bg-soft)] border border-[var(--admin-border)] flex items-center justify-center mx-auto">
            <UserIcon
              size={18}
              className="text-[var(--admin-muted)]"
            />
          </div>
          <h3 className="font-display text-[20px] text-[var(--admin-text)] mt-4 tracking-[-0.015em]">
            Kullanıcı yok
          </h3>
          <p className="text-[var(--admin-muted-2)] text-sm mt-2 max-w-sm mx-auto">
            İlk admin kullanıcısını oluşturmak için sağ üstteki butonu kullan.
          </p>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="admin-table">
          {filtered.map((u) => {
            const initial = (u.full_name || u.email || "?")
              .slice(0, 1)
              .toUpperCase();
            const active = !!u.is_active;
            return (
              <div key={u.id} className="admin-row">
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-semibold text-white shrink-0"
                  style={{
                    background:
                      "linear-gradient(135deg,#1d4ed8 0%,#06b6d4 55%,#84cc16 100%)",
                  }}>
                  {initial}
                </div>

                {/* Name + email */}
                <div className="min-w-0 flex-[1.4]">
                  <p className="text-[14px] font-semibold text-[var(--admin-text)] truncate leading-tight">
                    {u.full_name || "—"}
                  </p>
                  <p className="text-[12px] text-[var(--admin-muted)] truncate mt-0.5 flex items-center gap-1.5">
                    <MailIcon size={11} />
                    {u.email || "—"}
                  </p>
                </div>

                {/* Status */}
                <div className="hidden md:block shrink-0">
                  <span
                    className={`admin-badge ${
                      active
                        ? "admin-badge--confirmed"
                        : "admin-badge--neutral"
                    }`}
                  >
                    <span className="admin-badge__dot" />
                    {active ? "Aktif" : "Pasif"}
                  </span>
                </div>

                {/* 2FA durumu — TÜM satırlarda salt-okunur rozet olarak
                    gösterilir (istek #2). Yönetim butonu ise yalnız
                    aşağıda, giriş yapmış adminin KENDİ satırında
                    render edilir (istek #3/#4). */}
                <div className="hidden md:block shrink-0">
                  <span
                    className={`admin-badge ${
                      u.totp_enabled
                        ? "admin-badge--confirmed"
                        : "admin-badge--neutral"
                    }`}
                  >
                    {u.totp_enabled ? (
                      <ShieldCheck size={11} />
                    ) : (
                      <ShieldOff size={11} />
                    )}
                    {u.totp_enabled ? "2FA Aktif" : "2FA Kapalı"}
                  </span>
                </div>

                {/* Permissions count */}
                <div className="hidden lg:block shrink-0 min-w-[100px]">
                  <span className="admin-badge admin-badge--info">
                    <ShieldCheck size={11} />
                    {(u.sidebar_permissions || []).length} yetki
                  </span>
                </div>

                {/* Created */}
                <div className="text-right shrink-0 min-w-[140px]">
                  <p className="text-[12.5px] text-[var(--admin-text)] tabular-nums">
                    {formatDateTime(u.created_at)}
                  </p>
                  {u.last_login_at && (
                    <p className="text-[11px] text-[var(--admin-muted-2)] mt-0.5">
                      Son giriş: {formatDateTime(u.last_login_at)}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* 🛡️ TOTP 2FA yönetim butonu — YALNIZ giriş yapmış
                      adminin KENDİ satırında render edilir
                      (u.id === currentAdmin?.id). Bu yalnızca bir UI
                      kolaylığıdır; asıl güvenlik sınırı server'dadır:
                      /api/admin/2fa/* route'ları body'de hiçbir target
                      admin id kabul etmez, daima authorizeAdminSession()
                      ile çözülen ÇAĞIRANIN kendi session'ı üzerinden
                      çalışır. Yani bu buton gizlenmese/bypass edilse
                      bile başka bir adminin 2FA'sı API üzerinden de
                      yönetilemez. */}
                  {u.id === currentAdmin?.id && (
                    <button
                      type="button"
                      onClick={openTwoFaModal}
                      className="admin-icon-btn"
                      title={
                        u.totp_enabled ? "2FA'yı Yönet" : "2FA'yı Etkinleştir"
                      }
                      aria-label="2FA yönetimi"
                    >
                      {u.totp_enabled ? (
                        <ShieldCheck size={14} className="text-emerald-600" />
                      ) : (
                        <ShieldOff
                          size={14}
                          className="text-[var(--admin-muted)]"
                        />
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleToggleActive(u)}
                    className="admin-icon-btn"
                    title={active ? "Pasifleştir" : "Aktifleştir"}
                    aria-label="Aktif/pasif"
                  >
                    <Power
                      size={14}
                      className={
                        active
                          ? "text-emerald-600"
                          : "text-[var(--admin-muted)]"
                      }
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(u)}
                    className="admin-icon-btn"
                    title="Düzenle"
                    aria-label="Düzenle"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(u)}
                    className="admin-icon-btn"
                    title="Sil"
                    aria-label="Sil"
                  >
                    <Trash2 size={14} className="text-rose-600" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#020617]/45 backdrop-blur-sm">
          <div className="admin-card-flat w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-[var(--admin-surface)]">
            {/* MODAL HEADER */}
            <div className="admin-card__header sticky top-0 bg-[var(--admin-surface)] z-10">
              <div>
                <h3 className="admin-card__title">
                  {editingId ? "Kullanıcıyı düzenle" : "Yeni kullanıcı"}
                </h3>
                <p className="admin-card__sub">
                  Sidebar erişimi yetki listesinden kontrol edilir.
                </p>
              </div>
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="admin-icon-btn"
                aria-label="Kapat"
              >
                <X size={16} />
              </button>
            </div>

            {/* MODAL BODY */}
            <div className="p-6 space-y-6">
              {/* PROFILE FIELDS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--admin-muted)] flex items-center gap-1.5">
                    <UserIcon size={12} className="text-[var(--admin-accent-strong)]" />
                    Ad Soyad
                  </label>
                  <input
                    type="text"
                    value={form.full_name}
                    onChange={(e) =>
                      setForm({ ...form, full_name: e.target.value })
                    }
                    className="input"
                    placeholder="Burhan Dayıoğlu"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--admin-muted)] flex items-center gap-1.5">
                    <MailIcon size={12} className="text-[var(--admin-accent-strong)]" />
                    E-posta
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm({ ...form, email: e.target.value })
                    }
                    className="input"
                    placeholder="ornek@domain.com"
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--admin-muted)] flex items-center gap-1.5">
                    <KeyRound
                      size={12}
                      className="text-[var(--admin-accent-strong)]"
                    />
                    Şifre
                    {editingId && (
                      <span className="text-[10px] tracking-[0.16em] uppercase text-[var(--admin-muted-2)] ml-1">
                        (boş bırakırsan değişmez)
                      </span>
                    )}
                  </label>
                  <input
                    type="password"
                    value={form.password || ""}
                    onChange={(e) =>
                      setForm({ ...form, password: e.target.value })
                    }
                    className="input"
                    placeholder={editingId ? "••••••••" : "Yeni şifre"}
                    autoComplete="new-password"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--admin-muted)]">
                    Durum
                  </label>
                  <div className="flex items-center gap-3 bg-[var(--admin-bg-soft)] border border-[var(--admin-border)] rounded-xl px-4 py-2.5">
                    <span className="text-sm text-[var(--admin-text)]">
                      {form.is_active ? "Aktif" : "Pasif"}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setForm({ ...form, is_active: !form.is_active })
                      }
                      className={`relative w-10 h-5.5 ml-auto rounded-full transition shrink-0 ${
                        form.is_active
                          ? "bg-[var(--admin-accent)]"
                          : "bg-[var(--admin-border-strong)]"
                      }`}
                      style={{ width: 40, height: 22 }}
                      aria-label="Aktif/pasif"
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
                          form.is_active ? "left-[20px]" : "left-0.5"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* PERMISSIONS GRID */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] tracking-[0.08em] uppercase font-semibold text-[var(--admin-muted)] flex items-center gap-1.5">
                    <ShieldCheck
                      size={12}
                      className="text-[var(--admin-accent-strong)]"
                    />
                    Sidebar Yetkileri
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => selectAllPerms()}
                      className="text-[11.5px] text-[var(--admin-muted)] hover:text-[var(--admin-text)] underline-offset-2 hover:underline"
                    >
                      Tümünü seç
                    </button>
                    <span className="text-[11px] text-[var(--admin-muted-2)]">
                      ·
                    </span>
                    <button
                      type="button"
                      onClick={() => clearAllPerms()}
                      className="text-[11.5px] text-[var(--admin-muted)] hover:text-[var(--admin-text)] underline-offset-2 hover:underline"
                    >
                      Temizle
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  {groupedPerms.map(({ group, list }) => (
                    <div
                      key={group}
                      className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-bg-soft)]/60 p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[10.5px] tracking-[0.18em] uppercase font-semibold text-[var(--admin-muted-2)]">
                          {group}
                        </p>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => selectAllPerms(group)}
                            className="text-[10.5px] text-[var(--admin-muted)] hover:text-[var(--admin-text)]"
                          >
                            Tümü
                          </button>
                          <span className="text-[10px] text-[var(--admin-muted-2)]">
                            ·
                          </span>
                          <button
                            type="button"
                            onClick={() => clearAllPerms(group)}
                            className="text-[10.5px] text-[var(--admin-muted)] hover:text-[var(--admin-text)]"
                          >
                            Hiçbiri
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {list.map((p) => {
                          const checked = (form.sidebar_permissions || []).includes(
                            p.key
                          );
                          return (
                            <label
                              key={p.key}
                              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition text-[13px] ${
                                checked
                                  ? "bg-[var(--admin-accent-soft)] border-[var(--admin-accent)] text-[var(--admin-text)]"
                                  : "bg-[var(--admin-surface)] border-[var(--admin-border)] text-[var(--admin-muted)] hover:border-[var(--admin-border-strong)]"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  togglePerm(p.key, e.target.checked)
                                }
                                className="!w-3.5 !h-3.5 accent-[var(--admin-accent)]"
                              />
                              <span className="truncate">{p.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {formError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-[12.5px] text-rose-800">
                  {formError}
                </div>
              )}
            </div>

            {/* MODAL FOOTER */}
            <div className="px-6 pb-6 pt-2 flex items-center justify-end gap-2 border-t border-[var(--admin-border)] bg-[var(--admin-surface)] sticky bottom-0">
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="admin-btn-ghost"
              >
                İptal
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="admin-btn-primary"
              >
                {saving ? (
                  <>
                    <Loader2 size={15} className="animate-spin" />
                    Kaydediliyor…
                  </>
                ) : (
                  <>
                    <Save size={15} />
                    {editingId ? "Güncelle" : "Oluştur"}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===============================================================
          🛡️ TOTP 2FA MODAL — eski /maki-admin/hesabim'den BİREBİR
          taşındı (view state machine + JSX aynı, yalnız modal içine
          sarıldı). Yalnızca kendi satırındaki butonla açılır
          (u.id === currentAdmin?.id — bkz. yukarıdaki Actions bloğu).
          Akış/endpoint'ler DEĞİŞMEDİ; bkz. handler yorumları.
          =============================================================== */}
      {twoFaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#020617]/45 backdrop-blur-sm">
          <div className="admin-card-flat w-full max-w-xl max-h-[90vh] overflow-y-auto bg-[var(--admin-surface)]">
            <div className="admin-card__header sticky top-0 bg-[var(--admin-surface)] z-10">
              <div>
                <h3 className="admin-card__title">İki Adımlı Doğrulama</h3>
                <p className="admin-card__sub">
                  {currentAdmin?.full_name || currentAdmin?.email || "Hesabın"}{" "}
                  için 2FA yönetimi
                </p>
              </div>
              <button
                type="button"
                onClick={closeTwoFaModal}
                disabled={twoFaBusy}
                className="admin-icon-btn"
                aria-label="Kapat"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {twoFaView === "status" && (
                <div className="flex items-start gap-4">
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: currentAdmin?.totp_enabled
                        ? "rgba(16, 185, 129, 0.12)"
                        : "rgba(148, 163, 184, 0.15)",
                      color: currentAdmin?.totp_enabled
                        ? "rgb(5, 150, 105)"
                        : "var(--admin-muted)",
                    }}
                  >
                    {currentAdmin?.totp_enabled ? (
                      <ShieldCheck size={20} />
                    ) : (
                      <ShieldOff size={20} />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[var(--color-stone-900)]">
                      İki Adımlı Doğrulama
                    </p>
                    <p className="text-[13px] text-[var(--admin-muted)] mt-1 leading-relaxed">
                      {currentAdmin?.totp_enabled
                        ? "Aktif — girişte authenticator uygulamandaki 6 haneli kod istenir."
                        : "Pasif — hesabın yalnızca şifreyle korunuyor."}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {!currentAdmin?.totp_enabled ? (
                        <button
                          type="button"
                          onClick={handleStartEnroll}
                          disabled={twoFaBusy}
                          className="admin-btn-primary"
                        >
                          {twoFaBusy ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <ShieldCheck size={14} />
                          )}
                          2FA&apos;yı Etkinleştir
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              resetTwoFaReauth();
                              setTwoFaView("regenerate");
                            }}
                            className="admin-btn-ghost"
                          >
                            <RefreshCw size={14} />
                            Kurtarma Kodlarını Yenile
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              resetTwoFaReauth();
                              setTwoFaView("disable");
                            }}
                            className="admin-btn-ghost hover:!text-rose-600"
                          >
                            <ShieldOff size={14} />
                            2FA&apos;yı Kapat
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {twoFaView === "enroll" && enroll && (
                <div className="space-y-5">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-stone-900)]">
                      1. QR kodu tara
                    </p>
                    <p className="text-[13px] text-[var(--admin-muted)] mt-1">
                      Google Authenticator, Authy veya benzeri bir uygulamayla
                      aşağıdaki kodu tara.
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-3 py-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={enroll.qrDataUrl}
                      alt="TOTP QR kodu"
                      width={200}
                      height={200}
                      className="rounded-xl border border-[var(--admin-border)]"
                    />
                    <div className="flex items-center gap-2">
                      <code
                        className="text-[12px] px-2.5 py-1.5 rounded-lg font-mono tracking-wide"
                        style={{ background: TWO_FA_SOFT_BG }}
                      >
                        {enroll.secret}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopySecret}
                        className="admin-btn-ghost !px-2.5 !py-1.5"
                        title="Secret'ı kopyala"
                      >
                        {copiedSecret ? <Check size={13} /> : <Copy size={13} />}
                      </button>
                    </div>
                    <p className="text-[11.5px] text-[var(--admin-muted)]">
                      QR taranamıyorsa bu kodu uygulamana manuel gir.
                    </p>
                </div>

                  <form
                    onSubmit={handleConfirmEnroll}
                    className="space-y-3 pt-4 border-t border-[var(--admin-border)]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-stone-900)]">
                        2. Kodu doğrula
                      </p>
                      <p className="text-[13px] text-[var(--admin-muted)] mt-1">
                        Uygulamada görünen 6 haneli kodu gir.
                      </p>
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={enrollCode}
                      onChange={(e) =>
                        setEnrollCode(
                          e.target.value.replace(/\D/g, "").slice(0, 6)
                        )
                      }
                      disabled={twoFaBusy}
                      className="input !h-14 text-center text-2xl tracking-[0.4em] font-semibold max-w-[220px]"
                      placeholder="000000"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={twoFaBusy}
                        className="admin-btn-primary"
                      >
                        {twoFaBusy ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <ShieldCheck size={14} />
                        )}
                        Doğrula ve Etkinleştir
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEnroll(null);
                          setTwoFaView("status");
                        }}
                        disabled={twoFaBusy}
                        className="admin-btn-ghost"
                      >
                        Vazgeç
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {twoFaView === "recovery-reveal" && (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-stone-900)]">
                      Kurtarma Kodları
                    </p>
                    <p className="text-[13px] text-[var(--admin-muted)] mt-1 leading-relaxed">
                      Bu kodlar yalnız ŞİMDI gösteriliyor — daha sonra tekrar
                      görüntülenemez. Her kod tek kullanımlıktır. Güvenli bir
                      yere (parola yöneticisi vb.) kaydet.
                    </p>
                </div>
                  <div className="grid grid-cols-2 gap-2">
                    {recoveryCodes.map((c) => (
                      <code
                        key={c}
                        className="text-[13px] px-3 py-2 rounded-lg font-mono text-center tracking-wide"
                        style={{ background: TWO_FA_SOFT_BG }}
                      >
                        {c}
                      </code>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRecoveryCodes([]);
                      setTwoFaView("status");
                    }}
                    className="admin-btn-primary"
                  >
                    <Check size={14} />
                    Kaydettim, Devam Et
                  </button>
                </div>
              )}

              {(twoFaView === "disable" || twoFaView === "regenerate") && (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-stone-900)]">
                      {twoFaView === "disable"
                        ? "2FA'yı Kapat"
                        : "Kurtarma Kodlarını Yenile"}
                    </p>
                    <p className="text-[13px] text-[var(--admin-muted)] mt-1 leading-relaxed">
                      {twoFaView === "disable"
                        ? "Bu işlem 2FA'yı kapatır ve tüm kurtarma kodlarını geçersiz kılar."
                        : "Bu işlem mevcut tüm kurtarma kodlarını geçersiz kılıp yenilerini üretir."}{" "}
                      Devam etmek için şifreni veya mevcut doğrulama kodunu
                      gir.
                    </p>
                  </div>

                  <form
                    onSubmit={
                      twoFaView === "disable"
                        ? handleDisableTwoFa
                        : handleRegenerateRecovery
                    }
                    className="space-y-3"
                  >
                    <div className="flex gap-2 text-[12.5px]">
                      <button
                        type="button"
                        onClick={() => {
                          setReauthMode("password");
                          setReauthValue("");
                        }}
                        className="px-3 py-1.5 rounded-lg border transition-colors"
                        style={
                          reauthMode === "password"
                            ? {
                                borderColor: "var(--admin-accent-strong)",
                                color: "var(--admin-accent-strong)",
                            }
                            : {
                                borderColor: "var(--admin-border)",
                                color: "var(--admin-muted)",
                              }
                        }
                      >
                        Şifre ile
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReauthMode("code");
                          setReauthValue("");
                        }}
                        className="px-3 py-1.5 rounded-lg border transition-colors"
                        style={
                          reauthMode === "code"
                            ? {
                                borderColor: "var(--admin-accent-strong)",
                                color: "var(--admin-accent-strong)",
                            }
                            : {
                                borderColor: "var(--admin-border)",
                                color: "var(--admin-muted)",
                              }
                        }
                      >
                        Doğrulama kodu ile
                      </button>
                    </div>

                    <div className="relative max-w-xs">
                      <Lock
                        size={15}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--admin-muted)] pointer-events-none"
                      />
                      <input
                        type={reauthMode === "password" ? "password" : "text"}
                        inputMode={reauthMode === "code" ? "numeric" : undefined}
                        maxLength={reauthMode === "code" ? 6 : undefined}
                        value={reauthValue}
                        onChange={(e) =>
                          setReauthValue(
                            reauthMode === "code"
                              ? e.target.value.replace(/\D/g, "").slice(0, 6)
                              : e.target.value
                          )
                        }
                        disabled={twoFaBusy}
                        className="input !h-12 !pl-10"
                        placeholder={
                          reauthMode === "password" ? "Mevcut şifren" : "000000"
                        }
                        autoFocus
                      />
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={twoFaBusy}
                        className={
                          twoFaView === "disable"
                            ? "admin-btn-ghost hover:!text-rose-600"
                            : "admin-btn-primary"
                        }
                      >
                        {twoFaBusy ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <KeyRound size={14} />
                        )}
                        {twoFaView === "disable" ? "2FA'yı Kapat" : "Kodları Yenile"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          resetTwoFaReauth();
                          setTwoFaView("status");
                        }}
                        disabled={twoFaBusy}
                        className="admin-btn-ghost"
                      >
                        Vazgeç
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
