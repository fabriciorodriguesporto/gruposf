import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "./lib/supabase.js";

const DEMO_KEY = "acolitos-sfa-demo-v2";
const ROLE_SETS = {
  second: ["Microfone", "Naveta", "Turíbulo"],
  fourth: ["Microfone", "Missal"],
};

function uuid() {
  return crypto.randomUUID();
}

function makeMasses(from = new Date()) {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  const dates = [];
  for (let month = new Date(start.getFullYear(), start.getMonth(), 1); month <= end; month.setMonth(month.getMonth() + 1)) {
    const firstSaturday = 1 + ((6 - new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 7) % 7);
    for (const week of [2, 4]) {
      const day = new Date(month.getFullYear(), month.getMonth(), firstSaturday + (week - 1) * 7);
      if (day >= start && day <= end) {
        dates.push({
          id: uuid(),
          mass_date: localDate(day),
          mass_time: week === 2 ? "18:00" : "17:00",
          note: "",
          assignments: [],
        });
      }
    }
  }
  return dates;
}

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDemoData() {
  const saved = localStorage.getItem(DEMO_KEY);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      return { acolytes: parsed.acolytes || [], masses: parsed.masses || [] };
    } catch (error) {
      console.error("Não foi possível ler os dados da demonstração.", error);
    }
  }
  const acolytes = [
      { id: uuid(), name: "Acolito 01", photo_url: "" },
      { id: uuid(), name: "Acolito 02", photo_url: "" },
      { id: uuid(), name: "Acolito 03", photo_url: "" },
      { id: uuid(), name: "Acolito 04", photo_url: "" },
    ];
  return { acolytes, masses: makeAssignments(makeMasses(), acolytes) };
}

function prettyDate(dateString, includeWeekday = true) {
  if (!dateString) return "";
  const date = new Date(`${dateString}T12:00:00`);
  const value = new Intl.DateTimeFormat("pt-BR", {
    ...(includeWeekday ? { weekday: "long" } : {}),
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function nextMassDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

function dateLabel(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return {
    day: new Intl.DateTimeFormat("pt-BR", { day: "2-digit" }).format(date),
    month: new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(date).replace(".", ""),
    weekday: new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(date).replace(".", ""),
  };
}

function makeAssignments(masses, acolytes) {
  const roleCounts = {};
  const teamCounts = {};
  const pairCounts = {};
  let previousIds = [];
  const sorted = [...masses].sort((a, b) => a.mass_date.localeCompare(b.mass_date));
  return sorted.map((mass) => {
    const week = Math.ceil(new Date(`${mass.mass_date}T12:00:00`).getDate() / 7);
    const roles = week === 2 ? ROLE_SETS.second : ROLE_SETS.fourth;
    const available = [...acolytes].sort((a, b) => a.name.localeCompare(b.name));
    const count = Math.min(roles.length, available.length);
    let best = [];
    let bestScore = Infinity;
    const chosen = [];
    function search() {
      if (chosen.length === count) {
        const ids = chosen.map((person) => person.id).sort();
        const teamKey = ids.join("|");
        let score = (teamCounts[teamKey] || 0) * 100;
        chosen.forEach((person, index) => {
          score += (roleCounts[`${person.id}:${roles[index]}`] || 0) * 10;
          if (previousIds.includes(person.id)) score += 12;
        });
        for (let left = 0; left < ids.length; left += 1) {
          for (let right = left + 1; right < ids.length; right += 1) {
            score += (pairCounts[`${ids[left]}|${ids[right]}`] || 0) * 3;
          }
        }
        if (score < bestScore) {
          best = [...chosen];
          bestScore = score;
        }
        return;
      }
      available.forEach((person) => {
        if (!chosen.some((item) => item.id === person.id)) {
          chosen.push(person);
          search();
          chosen.pop();
        }
      });
    }
    search();
    const assignments = roles.map((role, index) => ({
      role,
      acolyte_id: best[index]?.id || null,
      acolyte: best[index] || null,
    }));
    best.forEach((person, index) => {
      const key = `${person.id}:${roles[index]}`;
      roleCounts[key] = (roleCounts[key] || 0) + 1;
    });
    const chosenIds = best.map((person) => person.id).sort();
    const teamKey = chosenIds.join("|");
    teamCounts[teamKey] = (teamCounts[teamKey] || 0) + 1;
    for (let left = 0; left < chosenIds.length; left += 1) {
      for (let right = left + 1; right < chosenIds.length; right += 1) {
        const key = `${chosenIds[left]}|${chosenIds[right]}`;
        pairCounts[key] = (pairCounts[key] || 0) + 1;
      }
    }
    previousIds = chosenIds;
    return { ...mass, assignments };
  });
}

async function loadRemoteData() {
  const [acolytesResponse, massesResponse, assignmentsResponse] = await Promise.all([
    supabase.from("acolytes").select("*").order("name"),
    supabase.from("masses").select("*").order("mass_date"),
    supabase.from("assignments").select("*"),
  ]);
  if (acolytesResponse.error) throw acolytesResponse.error;
  if (massesResponse.error) throw massesResponse.error;
  if (assignmentsResponse.error) throw assignmentsResponse.error;
  const acolytes = acolytesResponse.data || [];
  const assignmentsByMass = new Map();
  (assignmentsResponse.data || []).forEach((assignment) => {
    const list = assignmentsByMass.get(assignment.mass_id) || [];
    const acolyte = acolytes.find((person) => person.id === assignment.acolyte_id);
    list.push({
      ...assignment,
      acolyte: acolyte || (assignment.acolyte_name ? { name: assignment.acolyte_name, photo_url: "" } : null),
    });
    assignmentsByMass.set(assignment.mass_id, list);
  });
  return {
    acolytes,
    masses: (massesResponse.data || []).map((mass) => ({
      ...mass,
      assignments: assignmentsByMass.get(mass.id) || [],
    })),
  };
}

function Avatar({ person, className = "" }) {
  if (person?.photo_url) {
    return <img className={`avatar ${className}`} src={person.photo_url} alt={`Foto de ${person.name}`} />;
  }
  const initials = person?.name?.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "†";
  return <span className={`avatar avatar-placeholder ${className}`} aria-label={person?.name || "Sem acólito"}>{initials}</span>;
}

function PhotoCropper({ source, onCancel, onSave }) {
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(50);
  const [vertical, setVertical] = useState(50);
  function save() {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 320;
      const context = canvas.getContext("2d");
      const scale = Math.max(320 / image.width, 320 / image.height) * zoom;
      const width = image.width * scale;
      const height = image.height * scale;
      const x = -(width - 320) * (horizontal / 100);
      const y = -(height - 320) * (vertical / 100);
      context.drawImage(image, x, y, width, height);
      canvas.toBlob((blob) => {
        if (blob) onSave(blob);
      }, "image/jpeg", 0.86);
    };
    image.src = source;
  }
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="crop-dialog" role="dialog" aria-modal="true" aria-labelledby="crop-title">
        <div className="modal-heading">
          <div><span className="eyebrow">Foto de perfil</span><h2 id="crop-title">Ajuste o enquadramento</h2></div>
          <button className="icon-button" onClick={onCancel} aria-label="Fechar">×</button>
        </div>
        <div className="crop-preview">
          <img src={source} alt="Prévia da foto" style={{ objectPosition: `${horizontal}% ${vertical}%`, transform: `scale(${zoom})` }} />
        </div>
        <label className="range-field">Zoom <input type="range" min="1" max="2.5" step="0.05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /></label>
        <label className="range-field">Horizontal <input type="range" min="0" max="100" value={horizontal} onChange={(event) => setHorizontal(Number(event.target.value))} /></label>
        <label className="range-field">Vertical <input type="range" min="0" max="100" value={vertical} onChange={(event) => setVertical(Number(event.target.value))} /></label>
        <div className="modal-actions"><button className="button button-quiet" onClick={onCancel}>Cancelar</button><button className="button button-primary" onClick={save}>Usar esta foto</button></div>
      </section>
    </div>
  );
}

function App() {
  const [data, setData] = useState({ acolytes: [], masses: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("home");
  const [session, setSession] = useState(null);
  const [login, setLogin] = useState({ email: "", password: "" });
  const [loginBusy, setLoginBusy] = useState(false);
  const [newName, setNewName] = useState("");
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState("");
  const [cropSource, setCropSource] = useState("");
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState("");
  const [editForm, setEditForm] = useState({ mass_date: "", mass_time: "", note: "" });
  const [manualAssignment, setManualAssignment] = useState({ name: "", role: "" });

  useEffect(() => {
    if (!photo) {
      setPhotoPreview("");
      return undefined;
    }
    const url = URL.createObjectURL(photo);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        if (isSupabaseConfigured) {
          const remote = await loadRemoteData();
          if (active) setData(remote);
          const { data: authData, error: authError } = await supabase.auth.getSession();
          if (authError) throw authError;
          if (active) setSession(authData.session);
          const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            setSession(nextSession);
          });
          return () => subscription.subscription.unsubscribe();
        }
        if (active) setData(getDemoData());
      } catch (caught) {
        if (active) setError(`Não foi possível carregar os dados: ${caught.message}`);
      } finally {
        if (active) setLoading(false);
      }
    }
    const cleanup = init();
    return () => {
      active = false;
      cleanup.then((unsubscribe) => unsubscribe?.());
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured && !loading) {
      localStorage.setItem(DEMO_KEY, JSON.stringify(data));
    }
  }, [data, loading]);

  const nextMass = useMemo(() => data.masses.filter((mass) => mass.mass_date >= localDate(new Date())).sort((a, b) => a.mass_date.localeCompare(b.mass_date))[0], [data.masses]);

  function saveData(next) {
    setData(next);
    setError("");
  }

  async function handleLogin(event) {
    event.preventDefault();
    setLoginBusy(true);
    setError("");
    try {
      if (isSupabaseConfigured) {
        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email: login.email, password: login.password });
        if (authError) throw authError;
        const { data: adminRecord, error: adminError } = await supabase
          .from("admin_users")
          .select("user_id")
          .eq("user_id", authData.user.id)
          .maybeSingle();
        if (adminError || !adminRecord) {
          await supabase.auth.signOut();
          if (adminError) throw adminError;
          throw new Error("Este usuário não tem autorização para acessar o painel administrativo.");
        }
        setView("admin");
      } else if (login.email.trim().toLowerCase() === "admin" && login.password === "acolitos2026") {
        setSession({ demo: true });
        setView("admin");
      } else {
        throw new Error("No modo de demonstração, use admin / acolitos2026.");
      }
    } catch (caught) {
      setError(caught.message);
    } finally {
      setLoginBusy(false);
    }
  }

  async function handleLogout() {
    if (isSupabaseConfigured) {
      const { error: logoutError } = await supabase.auth.signOut();
      if (logoutError) setError(logoutError.message);
    }
    setSession(null);
    setView("home");
  }

  async function addAcolyte(event) {
    event.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const id = uuid();
      let photoUrl = "";
      if (photo) {
        if (isSupabaseConfigured) {
          const path = `${id}.jpg`;
          const { error: uploadError } = await supabase.storage.from("profile-photos").upload(path, photo, { contentType: "image/jpeg", upsert: true });
          if (uploadError) throw uploadError;
          photoUrl = supabase.storage.from("profile-photos").getPublicUrl(path).data.publicUrl;
        } else {
          photoUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error("Não foi possível ler a foto."));
            reader.readAsDataURL(photo);
          });
        }
      }
      const newAcolyte = { id, name: newName.trim(), photo_url: photoUrl };
      if (isSupabaseConfigured) {
        const { error: insertError } = await supabase.from("acolytes").insert(newAcolyte);
        if (insertError) throw insertError;
      }
      saveData({ ...data, acolytes: [...data.acolytes, newAcolyte].sort((a, b) => a.name.localeCompare(b.name)) });
      setNewName("");
      setPhoto(null);
      setNotice("Acólito adicionado com sucesso.");
    } catch (caught) {
      setError(`Não foi possível adicionar o acólito: ${caught.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAcolyte(person) {
    if (!window.confirm(`Remover ${person.name} do cadastro?`)) return;
    try {
      if (isSupabaseConfigured) {
        const { error: deleteError } = await supabase.from("acolytes").delete().eq("id", person.id);
        if (deleteError) throw deleteError;
      }
      const acolytes = data.acolytes.filter((item) => item.id !== person.id);
      const masses = data.masses.map((mass) => ({
        ...mass,
        assignments: (mass.assignments || []).map((assignment) => assignment.acolyte_id === person.id ? { ...assignment, acolyte_id: null, acolyte: null } : assignment),
      }));
      saveData({ acolytes, masses });
    } catch (caught) {
      setError(`Não foi possível remover o acólito: ${caught.message}`);
    }
  }

  async function generateSchedule() {
    setSaving(true);
    setError("");
    try {
      const baseMasses = makeMasses();
      const scheduled = makeAssignments(baseMasses, data.acolytes);
      if (isSupabaseConfigured) {
        const { error: deleteError } = await supabase.from("masses").delete().gte("mass_date", localDate(new Date()));
        if (deleteError) throw deleteError;
        const { error: insertMassesError } = await supabase.from("masses").insert(scheduled.map(({ id, mass_date, mass_time, note }) => ({ id, mass_date, mass_time, note })));
        if (insertMassesError) throw insertMassesError;
        const rows = scheduled.flatMap((mass) => mass.assignments.map((assignment) => ({
          mass_id: mass.id,
          acolyte_id: assignment.acolyte_id,
          role: assignment.role,
        })));
        if (rows.length) {
          const { error: insertAssignmentsError } = await supabase.from("assignments").insert(rows);
          if (insertAssignmentsError) throw insertAssignmentsError;
        }
      }
      const future = data.masses.filter((mass) => mass.mass_date < localDate(new Date()));
      saveData({ ...data, masses: [...future, ...scheduled].sort((a, b) => a.mass_date.localeCompare(b.mass_date)) });
      setNotice("Escala do próximo ano gerada, buscando variar ao máximo equipes e funções.");
    } catch (caught) {
      setError(`Não foi possível gerar a escala: ${caught.message}`);
    } finally {
      setSaving(false);
    }
  }

  function beginEdit(mass) {
    setEditing(mass.id);
    setEditForm({ mass_date: mass.mass_date, mass_time: mass.mass_time, note: mass.note || "" });
    setManualAssignment({ name: "", role: "" });
  }

  async function addManualAssignment(mass) {
    const name = manualAssignment.name.trim();
    const role = manualAssignment.role.trim();
    if (!name || !role) {
      setError("Informe o nome do acólito e a função.");
      return;
    }

    setSaving(true);
    try {
      const assignment = {
        id: uuid(),
        mass_id: mass.id,
        acolyte_id: null,
        acolyte_name: name,
        role,
        acolyte: { name, photo_url: "" },
      };
      if (isSupabaseConfigured) {
        const { error: insertError } = await supabase.from("assignments").insert({
          mass_id: assignment.mass_id,
          acolyte_id: assignment.acolyte_id,
          acolyte_name: assignment.acolyte_name,
          role: assignment.role,
        });
        if (insertError) throw insertError;
      }
      saveData({
        ...data,
        masses: data.masses.map((item) => item.id === mass.id
          ? { ...item, assignments: [...(item.assignments || []), assignment] }
          : item),
      });
      setManualAssignment({ name: "", role: "" });
      setNotice(`${name} foi adicionado à escala.`);
    } catch (caught) {
      setError(`Não foi possível adicionar à escala: ${caught.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function saveMassEdit(mass) {
    if (!editForm.mass_date || !editForm.mass_time) {
      setError("Informe a data e o horário da missa.");
      return;
    }
    try {
      if (isSupabaseConfigured) {
        const { error: updateError } = await supabase.from("masses").update(editForm).eq("id", mass.id);
        if (updateError) throw updateError;
      }
      saveData({ ...data, masses: data.masses.map((item) => item.id === mass.id ? { ...item, ...editForm } : item).sort((a, b) => a.mass_date.localeCompare(b.mass_date)) });
      setEditing("");
      setNotice("Missa atualizada.");
    } catch (caught) {
      setError(`Não foi possível atualizar a missa: ${caught.message}`);
    }
  }

  function choosePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Selecione um arquivo de imagem.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setCropSource(reader.result);
    reader.onerror = () => setError("Não foi possível abrir esta imagem.");
    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function renderSchedule(mass, admin = false) {
    const date = dateLabel(mass.mass_date);
    const isExpanded = expanded === mass.id;
    return (
      <article className={`schedule-card ${isExpanded ? "is-expanded" : ""}`} key={mass.id}>
        <button className="schedule-summary" onClick={() => setExpanded(isExpanded ? "" : mass.id)} aria-expanded={isExpanded}>
          <span className="date-tile"><strong>{date.day}</strong><span>{date.month}</span></span>
          <span className="schedule-summary-copy"><strong>{prettyDate(mass.mass_date)}</strong><span>Missa às {mass.mass_time} · {date.weekday}</span>{mass.note && <span className="notice-inline"><span className="notice-dot" /> Há um aviso para esta missa</span>}</span>
          <span className="chevron" aria-hidden="true">⌄</span>
        </button>
        {isExpanded && (
          <div className="schedule-details">
            {mass.note && <div className="notice-box"><span className="notice-dot" /><span><strong>Observação</strong><br />{mass.note}</span></div>}
            <div className="assignment-list">
              {(mass.assignments || []).map((assignment, index) => (
                <div className="assignment-row" key={`${mass.id}-${assignment.role}-${index}`}>
                  <Avatar person={assignment.acolyte} />
                  <span><strong>{assignment.acolyte?.name || "A definir"}</strong><small>{assignment.role}</small></span>
                </div>
              ))}
              {(!mass.assignments || mass.assignments.length === 0) && <p className="muted-copy">A escala desta missa ainda não foi gerada.</p>}
            </div>
            {admin && (editing === mass.id ? (
              <div className="edit-mass-form">
                <label>Data<input type="date" value={editForm.mass_date} onChange={(event) => setEditForm({ ...editForm, mass_date: event.target.value })} /></label>
                <label>Horário<input type="time" value={editForm.mass_time} onChange={(event) => setEditForm({ ...editForm, mass_time: event.target.value })} /></label>
                <label className="full-field">Observações<textarea rows="3" value={editForm.note} onChange={(event) => setEditForm({ ...editForm, note: event.target.value })} placeholder="Ex.: celebração especial, mudança de horário..." /></label>
                <div className="manual-assignment-form full-field">
                  <h4>Adicionar acólito à escala</h4>
                  <div className="manual-assignment-fields">
                    <label>Nome<input type="text" maxLength="100" value={manualAssignment.name} onChange={(event) => setManualAssignment({ ...manualAssignment, name: event.target.value })} placeholder="Nome do acólito" /></label>
                    <label>Função<input type="text" maxLength="80" value={manualAssignment.role} onChange={(event) => setManualAssignment({ ...manualAssignment, role: event.target.value })} placeholder="Função na missa" /></label>
                    <button className="button button-outline" type="button" disabled={saving} onClick={() => addManualAssignment(mass)}>Adicionar</button>
                  </div>
                </div>
                <div className="form-actions full-field"><button className="button button-quiet" onClick={() => setEditing("")}>Cancelar</button><button className="button button-primary" onClick={() => saveMassEdit(mass)}>Salvar alterações</button></div>
              </div>
            ) : <button className="text-button edit-button" onClick={() => beginEdit(mass)}>Editar data, horário ou observações</button>)}
          </div>
        )}
      </article>
    );
  }

  if (loading) {
    return <main className="loading-screen"><img className="brand-logo" src="/logo-sao-francisco.jpg" alt="" /><p>Preparando a escala...</p></main>;
  }

  return (
    <>
      <div className="page-shell">
        <header className="site-header">
          <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setView("home"); }} aria-label="Página inicial">
            <img className="brand-logo" src="/logo-sao-francisco.jpg" alt="" /><span className="brand-name">Acólitos<small>São Francisco de Assis</small></span>
          </a>
          {view === "home" ? <button className="button button-outline" onClick={() => { setError(""); setView(session ? "admin" : "login"); }}>Área administrativa <span aria-hidden="true">↗</span></button> : <button className="button button-quiet" onClick={() => { setError(""); setView("home"); }}>← Voltar ao início</button>}
        </header>

        {error && <div className="feedback feedback-error" role="alert"><span>!</span>{error}<button onClick={() => setError("")} aria-label="Fechar aviso">×</button></div>}
        {notice && <div className="feedback feedback-success" role="status"><span>✓</span>{notice}<button onClick={() => setNotice("")} aria-label="Fechar aviso">×</button></div>}

        {view === "home" && (
          <main>
            {!isSupabaseConfigured && <div className="demo-banner"><span className="notice-dot" />Modo demonstração: os dados ficam salvos neste navegador.</div>}
            <section className="next-mass-card">
              <div className="next-mass-main">
                <div className="next-mass-copy">
                  <span className="next-mass-title">Próxima missa</span>
                  <p className={`next-mass-date ${nextMass ? "" : "is-empty"}`}>
                    {nextMass ? `${nextMassDate(nextMass.mass_date)} às ${nextMass.mass_time} horas` : "A próxima escala será publicada em breve."}
                  </p>
                </div>
              </div>
              {nextMass && <div className="next-mass-schedule">
                <div className="next-mass-schedule-heading"><h3>Escala da missa</h3></div>
                {(nextMass.assignments || []).length ? <div className="featured-team">
                  {(nextMass.assignments || []).map((assignment, index) => <div className="featured-person" key={`${assignment.role}-${index}`}><Avatar person={assignment.acolyte} className="avatar-large" /><span className="role-label">{assignment.role}</span><strong>{assignment.acolyte?.name || "A definir"}</strong></div>)}
                </div> : <p className="muted-copy">A escala ainda não foi publicada.</p>}
              </div>}
              {nextMass?.note && <div className="hero-notice"><span className="notice-dot" /><span><strong>Aviso importante</strong>{nextMass.note}</span></div>}
            </section>
            <section className="upcoming-section">
              <div className="section-heading"><div><span className="eyebrow">Agenda</span><h2>Próximas missas</h2></div><span className="muted-copy">{data.masses.filter((mass) => mass.mass_date >= localDate(new Date())).length} celebrações</span></div>
              <div className="schedule-list">{data.masses.filter((mass) => mass.mass_date >= localDate(new Date())).map((mass) => renderSchedule(mass))}</div>
            </section>
          </main>
        )}

        {view === "login" && (
          <main className="auth-page">
            <div className="auth-card">
              <img className="auth-logo" src="/logo-sao-francisco.jpg" alt="" /><span className="eyebrow">Acesso restrito</span><h1>Área administrativa</h1><p>Entre para organizar os acólitos e as escalas das missas.</p>
              <form className="stack-form" onSubmit={handleLogin}>
                <label>Usuário (e-mail)<input type={isSupabaseConfigured ? "email" : "text"} autoComplete="username" required value={login.email} onChange={(event) => setLogin({ ...login, email: event.target.value })} placeholder={isSupabaseConfigured ? "seu@email.com" : "admin"} /></label>
                <label>Senha<input type="password" autoComplete="current-password" required value={login.password} onChange={(event) => setLogin({ ...login, password: event.target.value })} placeholder="Sua senha" /></label>
                {!isSupabaseConfigured && <small className="demo-login-hint">Demonstração: usuário <strong>admin</strong> · senha <strong>acolitos2026</strong></small>}
                <button className="button button-primary button-wide" disabled={loginBusy}>{loginBusy ? "Entrando..." : "Entrar"} <span aria-hidden="true">→</span></button>
              </form>
            </div>
          </main>
        )}

        {view === "admin" && (
          <main className="admin-page">
            {!session && isSupabaseConfigured ? <div className="auth-card"><span className="eyebrow">Acesso restrito</span><h1>Entre para continuar</h1><button className="button button-primary" onClick={() => setView("login")}>Ir para o login</button></div> : <>
              <div className="admin-welcome"><div><span className="eyebrow">Organização</span><h1>Painel administrativo</h1><p>Cuide das pessoas e das escalas da comunidade.</p></div><button className="button button-quiet" onClick={handleLogout}>Sair</button></div>
              {!isSupabaseConfigured && <div className="demo-banner"><span className="notice-dot" />Modo demonstração — alterações salvas apenas neste navegador.</div>}
              <section className="admin-section"><div className="section-heading"><div><span className="eyebrow">Nossa comunidade</span><h2>Acólitos inscritos</h2></div><span className="soft-tag">{data.acolytes.length} pessoas</span></div>
                {data.acolytes.length ? <div className="roster-grid">{data.acolytes.map((person) => <article className="roster-card" key={person.id}><Avatar person={person} className="avatar-large" /><strong>{person.name}</strong><button className="remove-link" onClick={() => deleteAcolyte(person)}>Remover</button></article>)}</div> : <p className="empty-state">Ainda não há acólitos cadastrados. Adicione a primeira pessoa abaixo.</p>}
              </section>
              <section className="admin-section add-section"><div className="section-heading"><div><span className="eyebrow">Cadastro</span><h2>Adicionar acólito</h2></div></div>
                <form className="add-person-form" onSubmit={addAcolyte}>
                  <label className="photo-upload">{photo ? <Avatar person={{ name: newName, photo_url: photoPreview }} className="avatar-large" /> : <span className="upload-placeholder">＋</span>}<span>{photo ? "Trocar foto" : "Adicionar foto"}<small>JPG ou PNG</small></span><input type="file" accept="image/*" onChange={choosePhoto} /></label>
                  <label className="name-field">Nome completo<input type="text" required maxLength="100" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Nome do acólito" /></label>
                  <button className="button button-primary add-button" disabled={saving}>{saving ? "Salvando..." : "Adicionar acólito"}</button>
                </form>
              </section>
              <section className="admin-section generation-card"><div><span className="eyebrow">Escala inteligente</span><h2>Gerar escala do próximo ano</h2><p>As equipes e funções são distribuídas para buscar o máximo de combinações variadas, equilibrando a participação entre todos.</p><small>2º sábado · 18h · Microfone, Naveta e Turíbulo<br />4º sábado · 17h · Microfone e Missal</small></div><button className="button button-primary" disabled={saving} onClick={generateSchedule}>{saving ? "Gerando..." : "Gerar escala"} <span aria-hidden="true">→</span></button></section>
              <section className="admin-section"><div className="section-heading"><div><span className="eyebrow">Planejamento</span><h2>Escalas das próximas missas</h2></div><span className="muted-copy">{data.masses.length} datas</span></div><div className="schedule-list">{data.masses.map((mass) => renderSchedule(mass, true))}</div></section>
            </>}
          </main>
        )}
      </div>
      {cropSource && <PhotoCropper source={cropSource} onCancel={() => setCropSource("")} onSave={(blob) => { setPhoto(blob); setCropSource(""); }} />}
    </>
  );
}

export default App;
