 "use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Draft = { id: string; title: string; status: string; project: any; content: any; image_urls: string[]; created_at: string };
const channels = [
  { key: "blog", name: "네이버 블로그", field: "body" },
  { key: "instagram", name: "인스타그램", field: "caption" },
  { key: "threads", name: "스레드", field: "post" },
  { key: "reels", name: "인스타 릴스", field: "voiceover" }
];

export default function Home() {
  const [email, setEmail] = useState("");
  const [user, setUser] = useState<any>(null);
  const [authMessage, setAuthMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploadedUrls, setUploadedUrls] = useState<string[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [project, setProject] = useState({ site: "", work: "", area: "부산·경남", notes: "" });
  const [content, setContent] = useState<any>(null);
  const [checks, setChecks] = useState<string[]>([]);
  const [active, setActive] = useState("blog");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [draftId, setDraftId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => { if (user) loadDrafts(); }, [user]);

  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(URL.revokeObjectURL);
  }, [files]);

  async function login() {
    setBusy(true); setAuthMessage("");
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setAuthMessage(error ? error.message : "로그인 링크를 이메일로 보냈습니다. 메일을 확인해주세요.");
    setBusy(false);
  }

  async function loadDrafts() {
    const { data, error } = await supabase.from("content_items").select("*").order("created_at", { ascending: false }).limit(30);
    if (!error && data) setDrafts(data as Draft[]);
  }

  async function generate() {
    if (!files.length) { setMessage("시공 사진을 먼저 올려주세요."); return; }
    setBusy(true); setMessage("사진 업로드 및 콘텐츠 생성 중입니다...");
    try {
      const urls: string[] = [];
      for (const file of files.slice(0, 8)) {
        const safeName = `${user.id}/${Date.now()}-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const { error } = await supabase.storage.from("site-photos").upload(safeName, file, { upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from("site-photos").getPublicUrl(safeName);
        urls.push(data.publicUrl);
      }
      const res = await fetch("/api/generate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, imageUrls: urls })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "생성 실패");
      setUploadedUrls(urls);
      setContent(json.content);
      setChecks(json.content.checks || []);
      setDraftId(null);
      setMessage("콘텐츠 초안이 만들어졌습니다. 내용을 확인하고 저장·승인하세요.");
    } catch (e: any) { setMessage(e.message || "오류가 발생했습니다."); }
    finally { setBusy(false); }
  }

  function updateField(channel: string, field: string, value: string) {
    setContent((old: any) => ({ ...old, [channel]: { ...old[channel], [field]: value } }));
  }

  async function save(status: "draft" | "approved") {
    if (!content) return;
    setBusy(true);
    const title = content.blog?.title || project.site || "새 시공 콘텐츠";
    const payload = { title, status, project, content, image_urls: uploadedUrls };
    const query = draftId
      ? await supabase.from("content_items").update(payload).eq("id", draftId).select().single()
      : await supabase.from("content_items").insert(payload).select().single();
    if (query.error) setMessage(query.error.message);
    else {
      setDraftId(query.data.id);
      setMessage(status === "approved" ? "승인 완료. 실제 채널 게시 전 계정 연동이 필요합니다." : "초안을 클라우드에 저장했습니다.");
      await loadDrafts();
    }
    setBusy(false);
  }

  async function openDraft(d: Draft) {
    setContent(d.content); setProject(d.project || project); setUploadedUrls(d.image_urls || []); setDraftId(d.id); setChecks(d.content?.checks || []); setActive("blog");
    setMessage("저장된 콘텐츠를 불러왔습니다.");
  }

  async function copyCurrent() {
    const c = content?.[active];
    const text = active === "blog" ? `${c?.title || ""}\n\n${c?.body || ""}\n\n${c?.hashtags || ""}`
      : active === "instagram" ? `${c?.caption || ""}\n\n${c?.hashtags || ""}`
      : active === "threads" ? c?.post || ""
      : `${c?.cover || ""}\n${c?.voiceover || ""}\n${c?.ending || ""}`;
    await navigator.clipboard.writeText(text);
    setMessage("현재 플랫폼 원고를 복사했습니다.");
  }

  const current = content?.[active];
  const reelsText = useMemo(() => (current?.scenes || []).map((s: any) => `${s.seconds} | ${s.visual}\n자막: ${s.caption}`).join("\n\n"), [current]);

  if (!user) return <main className="login"><div className="loginCard"><div className="brandMark">HB</div><p className="eyebrow">HANULBIT WINDOW</p><h1>콘텐츠 스튜디오</h1><p className="muted">하늘빛창호 전용 시공 콘텐츠 관리 공간</p><label>관리자 이메일</label><input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="이메일 주소" /><button onClick={login} disabled={busy || !email.includes("@")}>{busy ? "전송 중..." : "로그인 링크 받기"}</button><p className="hint">{authMessage || "최초 사용 시에도 이메일 인증으로 로그인합니다."}</p></div></main>;

  return <main className="shell">
    <header className="topbar"><div><div className="eyebrow">HANULBIT WINDOW</div><strong>하늘빛창호 콘텐츠 스튜디오</strong></div><div className="topRight"><span>{user.email}</span><button className="ghost small" onClick={() => supabase.auth.signOut()}>로그아웃</button></div></header>
    <section className="intro"><div><p className="eyebrow">CONTENT WORKFLOW</p><h1>시공 사진 하나로<br className="mobile"/> 4개 채널 콘텐츠 만들기</h1><p className="muted">사진 업로드 → AI 초안 → 검토·수정 → 승인</p></div><div className="statusPill">검토 후 승인 게시</div></section>
    <div className="layout">
      <section className="panel inputPanel">
        <div className="sectionHead"><span className="step">01</span><div><h2>현장 정보와 사진</h2><p>모르는 항목은 비워도 됩니다.</p></div></div>
        <label>현장명 / 아파트명</label><input value={project.site} onChange={e => setProject({...project, site:e.target.value})} placeholder="예: 부산 ○○아파트" />
        <label>시공 내용</label><input value={project.work} onChange={e => setProject({...project, work:e.target.value})} placeholder="예: 거실·안방 창호 교체" />
        <label>지역</label><input value={project.area} onChange={e => setProject({...project, area:e.target.value})} />
        <label>추가 메모</label><textarea value={project.notes} onChange={e => setProject({...project, notes:e.target.value})} placeholder="예: 철거 후 하루 시공, 고객 요청사항 등 확인된 정보만 입력" rows={3}/>
        <label className="uploadBox"><span className="uploadIcon">＋</span><strong>시공 사진 추가</strong><small>최대 8장 · JPG / PNG / WEBP</small><input type="file" accept="image/*" multiple onChange={e => setFiles(Array.from(e.target.files || []).slice(0,8))}/></label>
        {previews.length > 0 && <div className="previewGrid">{previews.map((src,i)=><img key={src} src={src} alt={`업로드 사진 ${i+1}`}/>)}</div>}
        <button className="primary full" disabled={busy || !files.length} onClick={generate}>{busy ? "처리 중..." : "✦ 4개 플랫폼 콘텐츠 생성"}</button>
        <p className="hint">사진은 비공개 계정의 저장 공간에 보관됩니다. 공개 게시 전 초안을 직접 확인하세요.</p>
      </section>

      <section className="panel editorPanel">
        <div className="sectionHead"><span className="step">02</span><div><h2>콘텐츠 검토 및 승인</h2><p>각 채널 탭에서 문구를 수정할 수 있습니다.</p></div></div>
        {!content ? <div className="empty"><div className="emptyIcon">✧</div><strong>아직 생성된 콘텐츠가 없습니다.</strong><p>왼쪽에서 사진을 올리고 콘텐츠를 생성하세요.</p></div> : <>
          <div className="tabs">{channels.map(c=><button key={c.key} className={active===c.key?"tab active":"tab"} onClick={()=>setActive(c.key)}>{c.name}</button>)}</div>
          {active==="blog" && <><label>제목</label><input value={current?.title || ""} onChange={e=>updateField(active,"title",e.target.value)}/><label>본문</label><textarea className="longText" value={current?.body || ""} onChange={e=>updateField(active,"body",e.target.value)}/><label>해시태그</label><textarea rows={2} value={current?.hashtags || ""} onChange={e=>updateField(active,"hashtags",e.target.value)}/></>}
          {active==="instagram" && <><label>게시글</label><textarea className="longText" value={current?.caption || ""} onChange={e=>updateField(active,"caption",e.target.value)}/><label>해시태그</label><textarea rows={3} value={current?.hashtags || ""} onChange={e=>updateField(active,"hashtags",e.target.value)}/></>}
          {active==="threads" && <><label>스레드 게시글</label><textarea className="longText" value={current?.post || ""} onChange={e=>updateField(active,"post",e.target.value)}/></>}
          {active==="reels" && <><label>릴스 표지 문구</label><input value={current?.cover || ""} onChange={e=>updateField(active,"cover",e.target.value)}/><label>장면 구성</label><textarea className="longText" value={reelsText} readOnly/><label>내레이션</label><textarea rows={5} value={current?.voiceover || ""} onChange={e=>updateField(active,"voiceover",e.target.value)}/><label>마무리 문구</label><input value={current?.ending || ""} onChange={e=>updateField(active,"ending",e.target.value)}/><p className="hint">첫 버전은 릴스 대본·자막 구성까지 제공합니다. 실제 영상 파일 자동 편집은 다음 단계에서 추가합니다.</p></>}
          {checks.length>0 && <div className="checks"><strong>게시 전 사실 확인</strong>{checks.map((x,i)=><p key={i}>• {x}</p>)}</div>}
          <div className="actions"><button className="ghost" onClick={copyCurrent}>현재 원고 복사</button><button className="ghost" disabled={busy} onClick={()=>save("draft")}>초안 저장</button><button className="primary" disabled={busy} onClick={()=>save("approved")}>검토 완료 · 승인</button></div>
        </>}
        {message && <div className="notice">{message}</div>}
      </section>
    </div>
    <section className="panel history"><div className="sectionHead"><span className="step">03</span><div><h2>콘텐츠 보관함</h2><p>다른 기기에서도 로그인하면 저장한 초안을 확인할 수 있습니다.</p></div><button className="ghost small refresh" onClick={loadDrafts}>새로고침</button></div>
      {drafts.length===0 ? <p className="muted">저장된 콘텐츠가 없습니다.</p> : <div className="draftList">{drafts.map(d=><button key={d.id} className="draftRow" onClick={()=>openDraft(d)}><span><strong>{d.title}</strong><small>{new Date(d.created_at).toLocaleString("ko-KR")}</small></span><em className={d.status==="approved"?"approved":""}>{d.status==="approved"?"승인됨":"초안"}</em></button>)}</div>}
    </section>
    <footer>하늘빛창호 · 부산·경남 창호 전문 시공 <span>초기 버전 0.1</span></footer>
  </main>;
}