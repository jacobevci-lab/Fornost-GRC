"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { withBasePath } from "./base-path";

const profileInitial = {
    type: "profile",
    modelId: "",
    intendedUse: "",
    prohibitedUses: "",
    capabilities: "",
    limitations: "",
    explanationMethod: "",
    humanOversight: "",
    noticeText: "",
    appealChannel: "",
    owner: "",
    affectedGroups: "",
    languages: ["tr"],
    reviewDate: "",
  },
  eventInitial = {
    type: "oversight",
    modelId: "",
    decisionReference: "",
    action: "overridden",
    severity: "medium",
    reason: "",
    outcome: "",
    controlOwner: "",
  };
type Profile = Omit<typeof profileInitial, "type"> & {
  id: string;
  gaps: string[];
  status: string;
  attention: string;
  createdBy: string;
};
type Oversight = Omit<typeof eventInitial, "type"> & {
  id: string;
  status: string;
  resolutionNote: string;
  createdBy: string;
  createdAt: string;
};

export default function FornostAiTransparency() {
  const [data, setData] = useState<{
      models: { id: string; system_name: string; model_name: string }[];
      profiles: Profile[];
      events: Oversight[];
      summary: Record<string, number>;
    }>({ models: [], profiles: [], events: [], summary: {} }),
    [profile, setProfile] = useState(profileInitial),
    [oversight, setOversight] = useState(eventInitial),
    [view, setView] = useState<"cards" | "oversight">("cards"),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [decision, setDecision] = useState<{
      type: string;
      id: string;
      status?: string;
      note: string;
      confirmation: string;
    } | null>(null);
  const load = useCallback(async () => {
    const response = await fetch(withBasePath("/api/ai/transparency"), {
        cache: "no-store",
      }),
      body = await response.json().catch(() => ({}));
    if (response.ok) setData(body);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  async function send(method: string, body: unknown) {
    setBusy(true);
    const response = await fetch(withBasePath("/api/ai/transparency"), {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      result = await response.json().catch(() => ({}));
    setNotice(
      response.ok
        ? method === "POST"
          ? `Kayıt oluşturuldu · ${result.gaps?.length || 0} boşluk`
          : "Karar kaydedildi."
        : String(result.error || "İşlem başarısız."),
    );
    if (response.ok) {
      setDecision(null);
      await load();
    }
    setBusy(false);
  }
  const phrase = (status: string) =>
    status === "approved"
      ? "SİSTEM KARTINI ONAYLA"
      : status === "rejected"
        ? "SİSTEM KARTINI REDDET"
        : "SİSTEM KARTINI EMEKLİ ET";
  return (
    <div className="ai-transparency">
      <header>
        <div>
          <small>TRANSPARENCY · EXPLAINABILITY · HUMAN OVERSIGHT</small>
          <h3>AI Şeffaflık ve İnsan Gözetimi</h3>
          <p>
            Model davranışını açıklayın, kullanıcı itirazını güvenceye alın ve
            insan müdahalelerini kanıtlayın.
          </p>
        </div>
        <a href={withBasePath("/api/ai/transparency?format=csv")}>
          Şeffaflık Kanıt CSV
        </a>
      </header>
      <div className="stats">
        {[
          ["profiles", "Sistem kartı"],
          ["current", "Güncel onay"],
          ["gaps", "Boşluklu"],
          ["openOversight", "Açık gözetim"],
          ["highRisk", "Yüksek/kritik"],
        ].map(([key, label]) => (
          <article key={key}>
            <b>{data.summary[key] || 0}</b>
            <span>{label}</span>
          </article>
        ))}
      </div>
      <nav>
        <button
          className={view === "cards" ? "active" : ""}
          onClick={() => setView("cards")}
        >
          AI Sistem Kartları
        </button>
        <button
          className={view === "oversight" ? "active" : ""}
          onClick={() => setView("oversight")}
        >
          İnsan Müdahaleleri
        </button>
      </nav>
      {view === "cards" ? (
        <>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void send("POST", profile);
            }}
          >
            <b>Yeni AI sistem kartı</b>
            <div className="grid">
              <label>
                AI modeli
                <select
                  required
                  value={profile.modelId}
                  onChange={(e) =>
                    setProfile({ ...profile, modelId: e.target.value })
                  }
                >
                  <option value="">Seçin</option>
                  {data.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.system_name} · {model.model_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sorumlu
                <input
                  required
                  value={profile.owner}
                  onChange={(e) =>
                    setProfile({ ...profile, owner: e.target.value })
                  }
                />
              </label>
              <label>
                Etkilenen gruplar
                <input
                  required
                  value={profile.affectedGroups}
                  onChange={(e) =>
                    setProfile({ ...profile, affectedGroups: e.target.value })
                  }
                />
              </label>
              <label>
                Diller
                <input
                  required
                  value={profile.languages.join(",")}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      languages: e.target.value
                        .split(",")
                        .map((x) => x.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </label>
              <label>
                Review tarihi
                <input
                  required
                  type="date"
                  value={profile.reviewDate}
                  onChange={(e) =>
                    setProfile({ ...profile, reviewDate: e.target.value })
                  }
                />
              </label>
              <label>
                İtiraz kanalı
                <input
                  required
                  placeholder="E-posta, portal veya form URL"
                  value={profile.appealChannel}
                  onChange={(e) =>
                    setProfile({ ...profile, appealChannel: e.target.value })
                  }
                />
              </label>
            </div>
            {[
              ["intendedUse", "Amaçlanan kullanım"],
              ["prohibitedUses", "Yasaklanan kullanımlar"],
              ["capabilities", "Yetenekler"],
              ["limitations", "Bilinen sınırlar"],
              ["explanationMethod", "Açıklama yöntemi"],
              ["humanOversight", "İnsan onay ve override mekanizması"],
              ["noticeText", "Kullanıcıya gösterilecek AI bildirimi"],
            ].map(([key, label]) => (
              <label key={key}>
                {label}
                <textarea
                  required
                  rows={3}
                  value={String(profile[key as keyof typeof profile])}
                  onChange={(e) =>
                    setProfile({ ...profile, [key]: e.target.value })
                  }
                />
              </label>
            ))}
            <button disabled={busy}>Sistem Kartını Değerlendir</button>
          </form>
          <div className="list">
            {data.profiles.map((item) => (
              <article key={item.id}>
                <header>
                  <div>
                    <b>{item.modelId} · Sistem Kartı</b>
                    <small>
                      {item.id} · {item.owner}
                    </small>
                  </div>
                  <span>
                    {item.status} · {item.attention}
                  </span>
                </header>
                <dl>
                  <div>
                    <dt>Amaç</dt>
                    <dd>{item.intendedUse}</dd>
                  </div>
                  <div>
                    <dt>Sınırlar</dt>
                    <dd>{item.limitations}</dd>
                  </div>
                  <div>
                    <dt>İtiraz</dt>
                    <dd>{item.appealChannel}</dd>
                  </div>
                  <div>
                    <dt>Review</dt>
                    <dd>{item.reviewDate}</dd>
                  </div>
                </dl>
                {item.gaps.length > 0 && (
                  <div className="gaps">
                    {item.gaps.map((gap) => (
                      <span key={gap}>{gap}</span>
                    ))}
                  </div>
                )}
                <blockquote>{item.noticeText}</blockquote>
                <footer>
                  {item.status === "draft" && (
                    <>
                      <button
                        disabled={item.gaps.length > 0}
                        onClick={() =>
                          setDecision({
                            type: "profile-decision",
                            id: item.id,
                            status: "approved",
                            note: "",
                            confirmation: "",
                          })
                        }
                      >
                        Onayla
                      </button>
                      <button
                        className="warn"
                        onClick={() =>
                          setDecision({
                            type: "profile-decision",
                            id: item.id,
                            status: "rejected",
                            note: "",
                            confirmation: "",
                          })
                        }
                      >
                        Reddet
                      </button>
                    </>
                  )}
                  {item.status !== "retired" && (
                    <button
                      className="danger"
                      onClick={() =>
                        setDecision({
                          type: "profile-decision",
                          id: item.id,
                          status: "retired",
                          note: "",
                          confirmation: "",
                        })
                      }
                    >
                      Emekli Et
                    </button>
                  )}
                </footer>
                {decision?.id === item.id && (
                  <div className="decision">
                    <textarea
                      placeholder="Karar gerekçesi"
                      value={decision.note}
                      onChange={(e) =>
                        setDecision({ ...decision, note: e.target.value })
                      }
                    />
                    <input
                      placeholder={phrase(decision.status || "")}
                      value={decision.confirmation}
                      onChange={(e) =>
                        setDecision({
                          ...decision,
                          confirmation: e.target.value,
                        })
                      }
                    />
                    <button
                      disabled={busy}
                      onClick={() => void send("PATCH", decision)}
                    >
                      Kararı Uygula
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      ) : (
        <>
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void send("POST", oversight);
            }}
          >
            <b>İnsan müdahalesi kaydı</b>
            <div className="grid">
              <label>
                AI modeli
                <select
                  required
                  value={oversight.modelId}
                  onChange={(e) =>
                    setOversight({ ...oversight, modelId: e.target.value })
                  }
                >
                  <option value="">Seçin</option>
                  {data.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.system_name} · {model.model_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Karar referansı
                <input
                  required
                  value={oversight.decisionReference}
                  onChange={(e) =>
                    setOversight({
                      ...oversight,
                      decisionReference: e.target.value,
                    })
                  }
                />
              </label>
              <label>
                İnsan aksiyonu
                <select
                  value={oversight.action}
                  onChange={(e) =>
                    setOversight({ ...oversight, action: e.target.value })
                  }
                >
                  {["confirmed", "overridden", "escalated", "stopped"].map(
                    (x) => (
                      <option key={x}>{x}</option>
                    ),
                  )}
                </select>
              </label>
              <label>
                Önem
                <select
                  value={oversight.severity}
                  onChange={(e) =>
                    setOversight({ ...oversight, severity: e.target.value })
                  }
                >
                  {["low", "medium", "high", "critical"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Kontrol sahibi
                <input
                  required
                  value={oversight.controlOwner}
                  onChange={(e) =>
                    setOversight({ ...oversight, controlOwner: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Müdahale gerekçesi
              <textarea
                required
                rows={3}
                value={oversight.reason}
                onChange={(e) =>
                  setOversight({ ...oversight, reason: e.target.value })
                }
              />
            </label>
            <label>
              İnsan kararı ve sonucu
              <textarea
                required
                rows={3}
                value={oversight.outcome}
                onChange={(e) =>
                  setOversight({ ...oversight, outcome: e.target.value })
                }
              />
            </label>
            <button disabled={busy}>İnsan Kararını Kaydet</button>
          </form>
          <div className="list oversight">
            {data.events.map((item) => (
              <article key={item.id}>
                <header>
                  <div>
                    <b>
                      {item.action} · {item.severity}
                    </b>
                    <small>
                      {item.id} · {item.modelId} · {item.decisionReference}
                    </small>
                  </div>
                  <span>{item.status}</span>
                </header>
                <p>
                  <b>Gerekçe:</b> {item.reason}
                </p>
                <p>
                  <b>Sonuç:</b> {item.outcome}
                </p>
                <small>
                  {item.controlOwner} ·{" "}
                  {new Date(item.createdAt).toLocaleString("tr-TR")}
                </small>
                {item.status === "open" && (
                  <button
                    onClick={() =>
                      setDecision({
                        type: "oversight-resolve",
                        id: item.id,
                        note: "",
                        confirmation: "",
                      })
                    }
                  >
                    Bulguyu Kapat
                  </button>
                )}
                {decision?.id === item.id && (
                  <div className="decision">
                    <textarea
                      placeholder="Çözüm ve doğrulama kanıtı"
                      value={decision.note}
                      onChange={(e) =>
                        setDecision({ ...decision, note: e.target.value })
                      }
                    />
                    <input
                      placeholder="GÖZETİM BULGUSUNU KAPAT"
                      value={decision.confirmation}
                      onChange={(e) =>
                        setDecision({
                          ...decision,
                          confirmation: e.target.value,
                        })
                      }
                    />
                    <button
                      disabled={busy}
                      onClick={() => void send("PATCH", decision)}
                    >
                      Kapatmayı Onayla
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}
      {notice && <div className="notice">{notice}</div>}
    </div>
  );
}
