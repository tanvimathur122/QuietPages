const $=id=>document.getElementById(id);

const modal=$("modal");
const cards=$("cards");

let token=localStorage.getItem("qp_token");
let currentUser=JSON.parse(localStorage.getItem("qp_user")||"null");
let editingId=null;
let currentPrompt=null;

const categories=[
  "Free Write",
  "Gratitude",
  "Daily Check-in",
  "Memories",
  "Thoughts",
  "Goals"
];

const moods={
  great:"😊 Great",
  good:"🙂 Good",
  okay:"😐 Okay",
  low:"😔 Low",
  difficult:"😣 Difficult"
};

const esc=s=>String(s??"").replace(
  /[&<>'"]/g,
  c=>({
    "&":"&amp;",
    "<":"&lt;",
    ">":"&gt;",
    "'":"&#39;",
    '"':"&quot;"
  }[c])
);

const date=s=>new Date(s).toLocaleDateString(
  undefined,
  {
    month:"short",
    day:"numeric",
    year:"numeric"
  }
);


/* =========================================================
   BASIC UI
   ====================================================
   
   ===== */

function toast(t){

  const x=$("toast");

  if(!x)return;

  x.textContent=t;

  x.classList.add("show");

  setTimeout(()=>{
    x.classList.remove("show");
  },2600);

}


function updateNav(){

  $("myLink")?.classList.toggle(
    "hidden",
    !currentUser
  );

  $("adminLink")?.classList.toggle(
    "hidden",
    currentUser?.role!=="admin"
  );

  if($("petsLink")){
    $("petsLink").classList.remove("hidden");
  }

  $("authBtn").textContent=
    currentUser?"Sign out":"Sign in";

  $("authBtn").onclick=
    currentUser?signOut:openAuth;

}


function goHome(){

  location.hash="stories";

  showHomeSections();

  const eyebrow=document.querySelector(
    ".section-heading .eyebrow"
  );

  const heading=document.querySelector(
    ".section-heading h2"
  );

  const paragraph=document.querySelector(
    ".section-heading p"
  );

  if(eyebrow)
    eyebrow.textContent="the quiet community";

  if(heading)
    heading.textContent="Words from here.";

  if(paragraph)
    paragraph.textContent=
      "Real thoughts. No performance required.";

  loadDiaries();

  window.scrollTo({
    top:0,
    behavior:"smooth"
  });

}


function hideMain(){

  document.querySelector("#homeHero")
    ?.classList.add("hidden");

  document.querySelector(".quick-start")
    ?.classList.add("hidden");

  document.querySelector(".privacy-strip")
    ?.classList.add("hidden");

}


function showHomeSections(){

  document.querySelector("#homeHero")
    ?.classList.remove("hidden");

  document.querySelector(".quick-start")
    ?.classList.remove("hidden");

  document.querySelector(".privacy-strip")
    ?.classList.remove("hidden");

}


function openModal(html){

  if(!$("modalContent"))return;

  $("modalContent").innerHTML=html;

  modal.classList.remove("hidden");

  setTimeout(()=>{

    initRevealTargets();
    initTiltCards();
    initMagnetic();

  },50);

}


function closeModal(){

  hideWritingCompanion();

  modal.classList.add("hidden");

  editingId=null;
  currentPrompt=null;

  const petMenu=$("petMenu");

  if(petMenu)
    petMenu.classList.add("hidden");

}


if(modal){

  modal.addEventListener("click",e=>{

    if(e.target===modal)
      closeModal();

  });

}


document.addEventListener("keydown",e=>{

  if(e.key==="Escape")
    closeModal();

});


/* =========================================================
   AUTH
   ========================================================= */

function openAuth(){

  openModal(`

    <span class="eyebrow">
      quiet pages
    </span>

    <h2>
      Come as you are.
    </h2>

    <p class="modal-sub">
      Sign in to keep pages private, save stories
      and track your writing.
    </p>

    <div class="tabs">

      <button
        class="active"
        onclick="authForm('login',this)">
        Sign in
      </button>

      <button
        onclick="authForm('signup',this)">
        Create account
      </button>

    </div>

    <div id="authForm"></div>

  `);

  authForm(
    "login",
    document.querySelector(".tabs button")
  );

}


function authForm(type,btn){

  document
    .querySelectorAll(".tabs button")
    .forEach(x=>x.classList.remove("active"));

  btn?.classList.add("active");

  $("authForm").innerHTML=
    type==="login"
    ?
    `

      <div class="form">

        <label>
          Email

          <input
            id="email"
            type="email"
            autocomplete="email">
        </label>

        <label>
          Password

          <input
            id="password"
            type="password"
            autocomplete="current-password">
        </label>

        <button
          class="submit-btn magnetic"
          onclick="login()">
          Sign in
        </button>

      </div>

    `
    :
    `

      <div class="form">

        <label>
          Your pen name

          <input
            id="name"
            maxlength="40"
            autocomplete="name">
        </label>

        <label>
          Email

          <input
            id="email"
            type="email"
            autocomplete="email">
        </label>

        <label>
          Password

          <input
            id="password"
            type="password"
            minlength="6"
            autocomplete="new-password">
        </label>

        <button
          class="submit-btn magnetic"
          onclick="signup()">
          Create my space
        </button>

      </div>

    `;

}


async function login(){

  const r=await fetch(
    "/api/login",
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        email:$("email").value,
        password:$("password").value
      })
    }
  );

  const d=await r.json();

  if(!r.ok)
    return toast(d.error);

  token=d.token;
  currentUser=d.user;

  localStorage.setItem(
    "qp_token",
    token
  );

  localStorage.setItem(
    "qp_user",
    JSON.stringify(currentUser)
  );

  closeModal();

  updateNav();

  toast("Welcome back.");

  showDashboard();

}


async function signup(){

  const r=await fetch(
    "/api/signup",
    {
      method:"POST",
      headers:{
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        name:$("name").value,
        email:$("email").value,
        password:$("password").value
      })
    }
  );

  const d=await r.json();

  if(!r.ok)
    return toast(d.error);

  token=d.token;
  currentUser=d.user;

  localStorage.setItem(
    "qp_token",
    token
  );

  localStorage.setItem(
    "qp_user",
    JSON.stringify(currentUser)
  );

  closeModal();

  updateNav();

  toast("Your quiet space is ready.");

  showDashboard();

}


function signOut(){

  token=null;
  currentUser=null;

  localStorage.removeItem("qp_token");
  localStorage.removeItem("qp_user");

  updateNav();

  showHomeSections();

  loadDiaries();

  toast("Signed out.");

}


/* =========================================================
   WRITE
   ========================================================= */

function openWrite(mode="free",id=null,data=null){

  if(!currentUser)
    return openAuth();

  editingId=id;

  currentPrompt=data?.prompt||null;

  const title=data?.title||"";
  const body=data?.body||"";
  const selectedMood=data?.mood||"";

  const selectedCategory=
    data?.category||
    (
      mode==="checkin"
      ?"Daily Check-in"
      :
      mode==="quick"
      ?"Thoughts"
      :
      "Free Write"
    );

  const visibility=
    data
    ?
    (
      data.is_anonymous
      ?"anonymous"
      :
      data.is_public
      ?"public"
      :
      "private"
    )
    :
    "private";


  openModal(`

    <span class="eyebrow">
      ${id?"edit your page":"new page"}
    </span>

    <h2>
      ${
        id
        ?"Give it another shape."
        :"What's on your mind?"
      }
    </h2>

    <p class="modal-sub">
      There is no right way to journal.
      A sentence is enough.
    </p>

    <div class="write-modes">

      <button
        onclick="setWriteMode('Free Write')">
        Free write
      </button>

      <button
        onclick="getPrompt()">
        ✦ Prompt me
      </button>

      <button
        onclick="setWriteMode('Daily Check-in')">
        Daily check-in
      </button>

    </div>

    <div
      id="promptBox"
      class="prompt-box ${currentPrompt?"":"hidden"}">

      ${currentPrompt?esc(currentPrompt):""}

      <button onclick="getPrompt()">
        Another prompt
      </button>

    </div>

    <div class="form">

      <label>

        Title

        <input
          id="diaryTitle"
          maxlength="100"
          value="${esc(title)}"
          placeholder="A small title, if you want one">

      </label>

      <label>

        Category

        <select id="diaryCategory">

          ${
            categories.map(c=>`

              <option
                ${c===selectedCategory?"selected":""}>

                ${c}

              </option>

            `).join("")
          }

        </select>

      </label>

      <label>

        How does this page feel?

        <div class="mood-picker">

          ${
            Object.entries(moods).map(
              ([k,v])=>`

                <button
                  type="button"
                  class="mood ${
                    k===selectedMood
                    ?"selected"
                    :""
                  }"
                  data-mood="${k}"
                  onclick="pickMood('${k}')">

                  ${v}

                </button>

              `
            ).join("")
          }

        </div>

      </label>

      <label>

        Your words

        <textarea
          id="diaryBody"
          rows="10"
          maxlength="12000"
          placeholder="Start wherever you are…">${esc(body)}</textarea>

      </label>

      <div class="visibility">

        <strong>
          Who can see this?
        </strong>

        <label>

          <input
            type="radio"
            name="visibility"
            value="private"
            ${visibility==="private"?"checked":""}>

          🔒 Private

          <small>
            Only you
          </small>

        </label>

        <label>

          <input
            type="radio"
            name="visibility"
            value="anonymous"
            ${visibility==="anonymous"?"checked":""}>

          🕊️ Anonymous

          <small>
            Public, without your name
          </small>

        </label>

        <label>

          <input
            type="radio"
            name="visibility"
            value="public"
            ${visibility==="public"?"checked":""}>

          🌿 Public

          <small>
            Shows your pen name
          </small>

        </label>

      </div>

      <div class="write-actions">

        <button
          class="outline-btn"
          onclick="saveDiary('draft')">

          Save draft

        </button>

        <button
          class="submit-btn magnetic"
          onclick="saveDiary('published')">

          ${id?"Save changes":"Save page"}

        </button>

      </div>

    </div>

  `);


  setTimeout(()=>{

    showWritingCompanion();

  },100);


}


function pickMood(m){

  document
    .querySelectorAll(".mood")
    .forEach(x=>{

      x.classList.toggle(
        "selected",
        x.dataset.mood===m
      );

    });

}


function setWriteMode(c){

  if($("diaryCategory"))
    $("diaryCategory").value=c;

}


async function getPrompt(){

  const r=await fetch(
    "/api/prompts/random"
  );

  const d=await r.json();

  currentPrompt=d.prompt?.text||null;

  if($("promptBox")){

    $("promptBox")
      .classList
      .toggle(
        "hidden",
        !currentPrompt
      );

    const textNode=$("promptBox").childNodes[0];

    if(textNode)
      textNode.textContent=currentPrompt||"";

  }

}


async function saveDiary(status){

  const visibility=
    document.querySelector(
      'input[name="visibility"]:checked'
    )?.value||"private";

  const body={

    title:$("diaryTitle").value,

    body:$("diaryBody").value,

    category:$("diaryCategory").value,

    mood:
      document.querySelector(
        ".mood.selected"
      )?.dataset.mood||null,

    visibility,

    prompt:currentPrompt,

    status

  };

  const url=
    editingId
    ?`/api/diaries/${editingId}`
    :"/api/diaries";

  const r=await fetch(
    url,
    {
      method:editingId?"PUT":"POST",

      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer "+token
      },

      body:JSON.stringify(body)
    }
  );

  const d=await r.json();

  if(!r.ok)
    return toast(d.error);

  closeModal();

  toast(
    status==="draft"
    ?"Draft saved."
    :"Your page is saved."
  );

  showDashboard();

}


/* =========================================================
   PUBLIC DIARIES
   ========================================================= */

async function loadDiaries(){

  const q=encodeURIComponent(
    $("search")?.value||""
  );

  const c=encodeURIComponent(
    $("publicCategory")?.value||""
  );

  const m=encodeURIComponent(
    $("publicMood")?.value||""
  );

  try{

    const r=await fetch(
      `/api/diaries?search=${q}&category=${c}&mood=${m}`
    );

    const d=await r.json();

    cards.innerHTML=
      d.diaries?.length
      ?
      d.diaries.map(
        x=>`

          <article
            class="card story-card tilt-card"
            onclick="readDiary(${x.id})">

            <div class="card-tag">

              <span>
                ${date(x.created_at)}
              </span>

              <span class="tag">
                ${esc(x.category||"Thoughts")}
              </span>

            </div>

            <h3>
              ${esc(x.title)}
            </h3>

            <p>
              ${esc(x.body).slice(0,180)}
              ${x.body.length>180?"…":""}
            </p>

            <div class="card-footer">

              <span>
                ${
                  x.is_anonymous
                  ?"🕊️ Anonymous"
                  :esc(x.author)
                }
              </span>

              <span>
                ${x.mood?moods[x.mood]:""}
              </span>

            </div>

          </article>

        `
      ).join("")
      :

      `

        <div class="empty">

          <h3>
            No stories yet.
          </h3>

          <p>
            Be the first to leave a quiet thought.
          </p>

        </div>

      `;

    refreshEffects();

  }catch{

    cards.innerHTML=`

      <div class="empty">

        <h3>
          Quiet for a moment.
        </h3>

        <p>
          We couldn't load the pages right now.
        </p>

      </div>

    `;

  }

}


async function readDiary(id){

  const r=await fetch(
    "/api/diaries/"+id
  );

  const d=await r.json();

  if(!r.ok)
    return toast(d.error);

  const x=d.diary;

  let bookmarked=false;

  if(currentUser){

    const b=await fetch(
      `/api/diaries/${id}/bookmark`,
      {
        headers:{
          Authorization:"Bearer "+token
        }
      }
    );

    const bd=await b.json();

    bookmarked=bd.bookmarked;

  }

  openModal(`

    <span class="eyebrow">

      ${esc(x.category||"Thoughts")}
      ·
      ${date(x.created_at)}

    </span>

    <h2>
      ${esc(x.title)}
    </h2>

    <div class="read-meta">

      ${
        x.is_anonymous
        ?"🕊️ Anonymous"
        :esc(x.author)
      }

      ${x.mood?" · "+moods[x.mood]:""}

    </div>

    ${
      x.prompt
      ?
      `<div class="prompt-box">
        ${esc(x.prompt)}
      </div>`
      :
      ""
    }

    <div class="reader">

      ${esc(x.body).replace(/\n/g,"<br>")}

    </div>

    <div class="read-actions">

      ${
        currentUser
        ?
        `

          <button
            class="outline-btn"
            onclick="toggleBookmark(${x.id},${bookmarked})">

            ${
              bookmarked
              ?"★ Saved"
              :"☆ Save page"
            }

          </button>

          <button
            class="outline-btn"
            onclick="reportDiary(${x.id})">

            Report

          </button>

        `
        :
        ""
      }

    </div>

  `);

}


/* =========================================================
   BOOKMARKS
   ========================================================= */

async function toggleBookmark(id,on){

  const r=await fetch(
    `/api/diaries/${id}/bookmark`,
    {
      method:on?"DELETE":"POST",

      headers:{
        Authorization:"Bearer "+token
      }
    }
  );

  if(!r.ok)
    return toast(
      "Could not update saved pages."
    );

  toast(
    on
    ?"Removed from saved pages."
    :"Saved for later."
  );

  readDiary(id);

}


/* =========================================================
   DASHBOARD
   ========================================================= */

async function showDashboard(){

  if(!currentUser)
    return openAuth();

  hideMain();

  document.querySelector(
    ".section-heading .eyebrow"
  ).textContent="your journal";

  document.querySelector(
    ".section-heading h2"
  ).textContent="A place that is yours.";

  document.querySelector(
    ".section-heading p"
  ).textContent=
    "Write, revisit and keep the pages that matter.";

  cards.innerHTML=
    '<div class="loading">Opening your journal…</div>';

  const H={
    Authorization:"Bearer "+token
  };

  const [
    mr,
    sr,
    br,
    pr
  ]=await Promise.all([

    fetch(
      "/api/my-diaries",
      {headers:H}
    ),

    fetch(
      "/api/stats/me",
      {headers:H}
    ),

    fetch(
      "/api/bookmarks",
      {headers:H}
    ),

    fetch(
      "/api/profile",
      {headers:H}
    )

  ]);

  if(mr.status===401)
    return signOut();

  const d=await mr.json();
  const stats=await sr.json();
  const saved=await br.json();
  const profile=await pr.json();

  const visible=
    d.diaries.filter(
      x=>x.status!=="draft"
    );

  const drafts=
    d.diaries.filter(
      x=>x.status==="draft"
    );

  cards.innerHTML=`

    <div class="profile-head">

      <div class="avatar">

        ${esc(
          currentUser.name[0]||"Q"
        ).toUpperCase()}

      </div>

      <div>

        <span class="eyebrow">
          your journal
        </span>

        <h2>
          Hello, ${esc(currentUser.name)}.
        </h2>

        <p>
          ${esc(
            profile.bio||
            "A quiet place for your words."
          )}
        </p>

      </div>

      <button
        class="outline-btn"
        onclick="openProfile()">

        Edit profile

      </button>

    </div>

    <div class="stats-row">

      <div>
        <strong>${stats.total}</strong>
        <span>Pages</span>
      </div>

      <div>
        <strong>${stats.currentStreak}🔥</strong>
        <span>Current streak</span>
      </div>

      <div>
        <strong>${stats.longestStreak}</strong>
        <span>Longest streak</span>
      </div>

      <div>
        <strong>${saved.diaries.length}</strong>
        <span>Saved</span>
      </div>

    </div>

    <div class="dashboard-tabs">

      <button
        class="active"
        onclick="renderDashboardTab('pages',this)">

        My pages

      </button>

      <button
        onclick="renderDashboardTab('drafts',this)">

        Drafts (${drafts.length})

      </button>

      <button
        onclick="renderDashboardTab('saved',this)">

        Saved (${saved.diaries.length})

      </button>

    </div>

    <div id="dashContent"></div>

  `;

  window.__dash={
    visible,
    drafts,
    saved:saved.diaries
  };

  renderDashboardTab(
    "pages",
    document.querySelector(
      ".dashboard-tabs button"
    )
  );

  refreshEffects();

}


function renderDashboardTab(tab,btn){

  document
    .querySelectorAll(
      ".dashboard-tabs button"
    )
    .forEach(x=>
      x.classList.remove("active")
    );

  btn?.classList.add("active");

  const items=
    tab==="pages"
    ?window.__dash.visible
    :
    tab==="drafts"
    ?window.__dash.drafts
    :
    window.__dash.saved;

  $("dashContent").innerHTML=`

    <div class="my-toolbar">

      <input
        id="mySearch"
        oninput="filterDash()"
        placeholder="Search your pages…">

      <select
        id="myCategory"
        onchange="filterDash()">

        <option value="">
          All categories
        </option>

        ${
          categories.map(
            c=>`<option>${c}</option>`
          ).join("")
        }

      </select>

      <select
        id="myMood"
        onchange="filterDash()">

        <option value="">
          All moods
        </option>

        ${
          Object.entries(moods).map(
            ([k,v])=>
            `<option value="${k}">
              ${v}
            </option>`
          ).join("")
        }

      </select>

    </div>

    <div
      id="dashList"
      class="my-list">

      ${renderDashList(items,tab)}

    </div>

  `;

  window.__dashItems=items;
  window.__dashTab=tab;

  initTiltCards();

}


function renderDashList(items,tab){

  return items.length
    ?
    items.map(
      d=>`

        <article class="card my-card tilt-card">

          <div class="card-tag">

            <span>
              ${date(d.created_at)}
            </span>

            <span class="tag">
              ${esc(d.category||"Thoughts")}
            </span>

          </div>

          <h3>
            ${esc(d.title)}
          </h3>

          <p>
            ${esc(d.body).slice(0,190)}
            ${d.body.length>190?"…":""}
          </p>

          <div class="card-footer">

            <span>

              ${
                d.status==="draft"
                ?"📝 Draft"
                :
                d.is_anonymous
                ?"🕊️ Anonymous"
                :
                d.is_public
                ?"🌿 Public"
                :
                "🔒 Private"
              }

              ${d.mood?" · "+moods[d.mood]:""}

            </span>

            <div class="inline-actions">

              ${
                tab==="saved"
                ?
                `

                  <button
                    onclick="
                      event.stopPropagation();
                      toggleBookmark(${d.id},true)
                    ">

                    Unsave

                  </button>

                `
                :
                `

                  <button
                    onclick="
                      event.stopPropagation();
                      openWrite(
                        'free',
                        ${d.id},
                        ${JSON.stringify(d)
                          .replace(/"/g,"&quot;")}
                      )
                    ">

                    Edit

                  </button>

                  <button
                    onclick="
                      event.stopPropagation();
                      deleteDiary(${d.id})
                    ">

                    Delete

                  </button>

                `
              }

            </div>

          </div>

        </article>

      `
    ).join("")
    :

    `

      <div class="empty">

        <h3>

          ${
            tab==="drafts"
            ?"No drafts yet."
            :
            tab==="saved"
            ?"Nothing saved yet."
            :
            "Your pages are waiting."
          }

        </h3>

        <p>
          Start with a thought, a feeling,
          or one sentence.
        </p>

        <button
          class="primary-btn magnetic"
          onclick="openWrite()">

          ＋ Write a page

        </button>

      </div>

    `;

}


function filterDash(){

  const q=
    $("mySearch")
    .value
    .toLowerCase();

  const c=$("myCategory").value;
  const m=$("myMood").value;

  const list=
    window.__dashItems.filter(
      d=>
        (
          !q||
          (
            d.title+" "+d.body
          )
          .toLowerCase()
          .includes(q)
        )
        &&
        (!c||d.category===c)
        &&
        (!m||d.mood===m)
    );

  $("dashList").innerHTML=
    renderDashList(
      list,
      window.__dashTab
    );

  initTiltCards();

}


async function deleteDiary(id){

  if(!confirm(
    "Delete this page permanently?"
  ))
    return;

  const r=await fetch(
    "/api/diaries/"+id,
    {
      method:"DELETE",
      headers:{
        Authorization:"Bearer "+token
      }
    }
  );

  const d=await r.json();

  if(!r.ok)
    return toast(d.error);

  toast("Page deleted.");

  showDashboard();

}


/* =========================================================
   PROFILE
   ========================================================= */

async function openProfile(){

  const r=await fetch(
    "/api/profile",
    {
      headers:{
        Authorization:"Bearer "+token
      }
    }
  );

  const d=await r.json();

  openModal(`

    <span class="eyebrow">
      your profile
    </span>

    <h2>
      How should your name feel here?
    </h2>

    <p class="modal-sub">
      This is your public pen name.
      Anonymous pages never show it.
    </p>

    <div class="form">

      <label>

        Pen name

        <input
          id="profileName"
          maxlength="40"
          value="${esc(d.user.name)}">

      </label>

      <label>

        Short bio

        <textarea
          id="profileBio"
          rows="4"
          maxlength="160"
          placeholder="A little about your writing…">${esc(d.bio)}</textarea>

      </label>

      <button
        class="submit-btn magnetic"
        onclick="saveProfile()">

        Save profile

      </button>

    </div>

  `);

}


async function saveProfile(){

  const r=await fetch(
    "/api/profile",
    {
      method:"PATCH",

      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer "+token
      },

      body:JSON.stringify({

        name:$("profileName").value,

        bio:$("profileBio").value

      })
    }
  );

  const d=await r.json();

  if(!r.ok)
    return toast(d.error);

  currentUser={
    ...currentUser,
    name:d.user.name
  };

  localStorage.setItem(
    "qp_user",
    JSON.stringify(currentUser)
  );

  closeModal();

  updateNav();

  toast("Profile updated.");

  showDashboard();

}


/* =========================================================
   SETTINGS
   ========================================================= */

function openSettings(){

  openModal(`

    <span class="eyebrow">
      settings
    </span>

    <h2>
      Make Quiet Pages fit you.
    </h2>

    <p class="modal-sub">
      These preferences stay on this device.
    </p>

    <div class="settings-list">

      <label class="setting">

        <span>

          <strong>
            Theme
          </strong>

          <small>
            Choose how Quiet Pages looks.
          </small>

        </span>

        <select
          id="themeSelect"
          onchange="applyTheme(this.value)">

          <option value="light">
            Light
          </option>

          <option value="dark">
            Dark
          </option>

          <option value="system">
            System
          </option>

        </select>

      </label>

      <label class="setting">

        <span>

          <strong>
            Text size
          </strong>

          <small>
            Make reading and writing more comfortable.
          </small>

        </span>

        <select
          id="fontSelect"
          onchange="applyFont(this.value)">

          <option value="normal">
            Normal
          </option>

          <option value="large">
            Large
          </option>

          <option value="xlarge">
            Extra large
          </option>

        </select>

      </label>

      <label class="setting">

        <span>

          <strong>
            Reduce motion
          </strong>

          <small>
            Use fewer animations.
          </small>

        </span>

        <input
          id="motionToggle"
          type="checkbox"
          onchange="applyMotion(this.checked)">

      </label>

    </div>

    ${
      currentUser
      ?
      `

        <button
          class="outline-btn full"
          onclick="openProfile()">

          Edit profile

        </button>

      `
      :
      ""
    }

  `);

  loadSettingsUI();

}


function applyTheme(v){

  localStorage.qp_theme=v;

  document.documentElement.dataset.theme=
    v==="system"
    ?
    (
      matchMedia(
        "(prefers-color-scheme:dark)"
      ).matches
      ?"dark"
      :"light"
    )
    :
    v;

}


function applyFont(v){

  localStorage.qp_font=v;

  document.documentElement.dataset.font=v;

}


function applyMotion(v){

  localStorage.qp_motion=
    v
    ?"reduce"
    :"normal";

  document.documentElement.dataset.motion=
    v
    ?"reduce"
    :"normal";

}


function loadSettingsUI(){

  if($("themeSelect"))
    $("themeSelect").value=
      localStorage.qp_theme||"light";

  if($("fontSelect"))
    $("fontSelect").value=
      localStorage.qp_font||"normal";

  if($("motionToggle"))
    $("motionToggle").checked=
      localStorage.qp_motion==="reduce";

}


/* =========================================================
   REPORTS
   ========================================================= */

function reportDiary(id){

  if(!currentUser)
    return openAuth();

  openModal(`

    <span class="eyebrow">
      help keep it kind
    </span>

    <h2>
      Report this page.
    </h2>

    <p class="modal-sub">
      Reports are reviewed by the Quiet Pages admin.
    </p>

    <div class="form">

      <label>

        Reason

        <select id="reportReason">

          <option>
            Spam
          </option>

          <option>
            Harassment or bullying
          </option>

          <option>
            Harmful or unsafe content
          </option>

          <option>
            Hate or discrimination
          </option>

          <option>
            Other
          </option>

        </select>

      </label>

      <label>

        Optional details

        <textarea
          id="reportDetails"
          rows="4"
          placeholder="Tell us what concerned you…"></textarea>

      </label>

      <button
        class="submit-btn magnetic"
        onclick="sendReport(${id})">

        Send report

      </button>

    </div>

  `);

}


async function sendReport(id){

  const r=await fetch(
    `/api/diaries/${id}/report`,
    {
      method:"POST",

      headers:{
        "Content-Type":"application/json",
        Authorization:"Bearer "+token
      },

      body:JSON.stringify({

        reason:$("reportReason").value,

        details:$("reportDetails").value

      })
    }
  );

  const d=await r.json();

  if(!r.ok)
    return toast(d.error);

  closeModal();

  toast(d.message);

}


/* =========================================================
   ADMIN
   ========================================================= */

async function showAdmin(){

  if(
    !currentUser||
    currentUser.role!=="admin"
  )
    return toast("Admin access required.");

  hideMain();

  document.querySelector(
    ".section-heading .eyebrow"
  ).textContent="admin workspace";

  document.querySelector(
    ".section-heading h2"
  ).textContent=
    "Quiet Pages control room.";

  document.querySelector(
    ".section-heading p"
  ).textContent=
    "Moderate gently. Protect privacy. Keep the community safe.";

  cards.innerHTML=
    '<div class="loading">Loading your control room…</div>';

  const H={
    Authorization:"Bearer "+token
  };

  const [
    s,
    u,
    e,
    r,
    a,
    p
  ]=await Promise.all([

    fetch(
      "/api/admin/stats",
      {headers:H}
    ),

    fetch(
      "/api/admin/users",
      {headers:H}
    ),

    fetch(
      "/api/admin/entries",
      {headers:H}
    ),

    fetch(
      "/api/admin/reports",
      {headers:H}
    ),

    fetch(
      "/api/admin/analytics",
      {headers:H}
    ),

    fetch(
      "/api/admin/prompts",
      {headers:H}
    )

  ]);

  const stats=(await s.json()).stats;
  const users=(await u.json()).users;
  const entries=(await e.json()).entries;
  const reports=(await r.json()).reports;
  const analytics=await a.json();
  const prompts=(await p.json()).prompts;

  cards.innerHTML=`

    <div class="admin-grid">

      ${
        [
          [stats.users,"Users"],
          [stats.entries,"Entries"],
          [stats.anonymous,"Anonymous"],
          [stats.reports,"Open reports"],
          [stats.publicEntries,"Published"],
          [stats.prompts,"Active prompts"]
        ].map(
          x=>`

            <div class="admin-stat">

              <strong>
                ${x[0]}
              </strong>

              <span>
                ${x[1]}
              </span>

            </div>

          `
        ).join("")
      }

    </div>

    <div class="admin-panels">

      <section class="admin-panel">

        <div class="panel-head">

          <div>

            <span class="eyebrow">
              mood pulse
            </span>

            <h3>
              How pages are feeling
            </h3>

          </div>

        </div>

        <div class="bar-list">

          ${
            analytics.moods
              .filter(x=>x.mood!=="none")
              .map(
                x=>`

                  <div>

                    <span>
                      ${moods[x.mood]||x.mood}
                    </span>

                    <b>
                      ${x.count}
                    </b>

                  </div>

                `
              )
              .join("")
              ||
              '<p class="muted">No mood data yet.</p>'
          }

        </div>

      </section>

      <section class="admin-panel">

        <div class="panel-head">

          <div>

            <span class="eyebrow">
              journal life
            </span>

            <h3>
              Categories
            </h3>

          </div>

        </div>

        <div class="bar-list">

          ${
            analytics.categories.map(
              x=>`

                <div>

                  <span>
                    ${esc(x.category)}
                  </span>

                  <b>
                    ${x.count}
                  </b>

                </div>

              `
            ).join("")
          }

        </div>

      </section>

    </div>

    <section class="admin-panel">

      <div class="panel-head">

        <div>

          <span class="eyebrow">
            moderation queue
          </span>

          <h3>
            Reports
          </h3>

        </div>

      </div>

      ${
        reports.length
        ?
        reports.map(
          x=>`

            <div class="admin-item">

              <div>

                <strong>
                  #${x.id} · ${esc(x.reason)}
                </strong>

                <p>

                  ${esc(x.title)}
                  ·
                  ${
                    x.is_anonymous
                    ?"Anonymous page"
                    :"Named page"
                  }

                  <br>

                  ${esc(
                    x.details||
                    "No extra details"
                  )}

                </p>

              </div>

              <div class="admin-actions">

                <span
                  class="status ${x.status}">

                  ${x.status}

                </span>

                ${
                  x.status==="open"
                  ?
                  `

                    <button
                      onclick="
                        updateReport(
                          ${x.id},
                          'resolved'
                        )
                      ">

                      Resolve

                    </button>

                    <button
                      onclick="
                        updateReport(
                          ${x.id},
                          'dismissed'
                        )
                      ">

                      Dismiss

                    </button>

                  `
                  :
                  ""
                }

              </div>

            </div>

          `
        ).join("")
        :
        '<p class="muted">No reports. The queue is clear.</p>'
      }

    </section>

    <section class="admin-panel">

      <div class="panel-head">

        <div>

          <span class="eyebrow">
            prompt library
          </span>

          <h3>
            Prompts
          </h3>

        </div>

        <button
          class="small-btn"
          onclick="addPrompt()">

          ＋ Add prompt

        </button>

      </div>

      ${
        prompts.map(
          x=>`

            <div class="admin-item">

              <div>

                <strong>
                  ${esc(x.text)}
                </strong>

                <p>
                  ${esc(x.category)}
                  ·
                  ${
                    x.is_active
                    ?"active"
                    :"hidden"
                  }
                </p>

              </div>

              <div class="admin-actions">

                <button
                  onclick="
                    togglePrompt(
                      ${x.id},
                      ${!x.is_active}
                    )
                  ">

                  ${
                    x.is_active
                    ?"Hide"
                    :"Activate"
                  }

                </button>

                <button
                  onclick="
                    deletePrompt(${x.id})
                  ">

                  Delete

                </button>

              </div>

            </div>

          `
        ).join("")
      }

    </section>

    <section class="admin-panel">

      <div class="panel-head">

        <div>

          <span class="eyebrow">
            content
          </span>

          <h3>
            Recent entries
          </h3>

        </div>

      </div>

      ${
        entries.slice(0,20).map(
          x=>`

            <div class="admin-item">

              <div>

                <strong>
                  ${esc(x.title)}
                </strong>

                <p>

                  ${
                    x.is_anonymous
                    ?"Anonymous"
                    :"By "+esc(x.owner)
                  }

                  ·
                  ${date(x.created_at)}

                  ·
                  ${esc(
                    x.category||
                    "Uncategorised"
                  )}

                </p>

              </div>

              <div class="admin-actions">

                <span
                  class="status ${x.status}">

                  ${x.status}

                </span>

                ${
                  x.is_public&&
                  x.status==="published"
                  ?
                  `

                    <button
                      onclick="
                        removeEntry(${x.id})
                      ">

                      Remove

                    </button>

                  `
                  :
                  ""
                }

              </div>

            </div>

          `
        ).join("")
      }

    </section>

    <section class="admin-panel">

      <div class="panel-head">

        <div>

          <span class="eyebrow">
            accounts
          </span>

          <h3>
            Users
          </h3>

        </div>

      </div>

      ${
        users.map(
          x=>`

            <div class="admin-item">

              <div>

                <strong>

                  ${esc(x.name)}

                  ${
                    x.role==="admin"
                    ?" · Admin"
                    :""
                  }

                </strong>

                <p>

                  ${esc(x.email)}
                  ·
                  ${x.entries} entries
                  · joined
                  ${date(x.created_at)}

                </p>

              </div>

              <div class="admin-actions">

                ${
                  x.role!=="admin"
                  ?
                  `

                    <button
                      onclick="
                        toggleUser(
                          ${x.id},
                          ${!x.is_suspended}
                        )
                      ">

                      ${
                        x.is_suspended
                        ?"Unsuspend"
                        :"Suspend"
                      }

                    </button>

                    <button
                      onclick="
                        deleteUser(${x.id})
                      ">

                      Delete

                    </button>

                  `
                  :
                  `

                    <span class="status admin">
                      protected
                    </span>

                  `
                }

              </div>

            </div>

          `
        ).join("")
      }

    </section>

  `;

  window.scrollTo({
    top:0,
    behavior:"smooth"
  });

  refreshEffects();

}


async function adminFetch(url,opts={}){

  opts.headers={

    ...(opts.headers||{}),

    Authorization:"Bearer "+token,

    "Content-Type":"application/json"

  };

  const r=await fetch(url,opts);

  const d=await r.json();

  if(!r.ok){

    toast(
      d.error||
      "Admin action failed."
    );

    return null;

  }

  return d;

}


async function updateReport(id,status){

  if(
    await adminFetch(
      `/api/admin/reports/${id}`,
      {
        method:"PATCH",
        body:JSON.stringify({status})
      }
    )
  )
    showAdmin();

}


async function removeEntry(id){

  if(!confirm(
    "Remove this entry from public view?"
  ))
    return;

  if(
    await adminFetch(
      `/api/admin/entries/${id}`,
      {
        method:"DELETE"
      }
    )
  )
    showAdmin();

}


async function toggleUser(id,suspended){

  if(
    await adminFetch(
      `/api/admin/users/${id}`,
      {
        method:"PATCH",
        body:JSON.stringify({suspended})
      }
    )
  )
    showAdmin();

}


async function deleteUser(id){

  if(!confirm(
    "Delete this user and their pages?"
  ))
    return;

  if(
    await adminFetch(
      `/api/admin/users/${id}`,
      {
        method:"DELETE"
      }
    )
  )
    showAdmin();

}


async function addPrompt(){

  const text=prompt(
    "Write the new journal prompt:"
  );

  if(!text)return;

  const category=
    prompt(
      "Category:",
      "Reflection"
    )||"Reflection";

  if(
    await adminFetch(
      "/api/admin/prompts",
      {
        method:"POST",
        body:JSON.stringify({
          text,
          category
        })
      }
    )
  )
    showAdmin();

}


async function togglePrompt(id,is_active){

  if(
    await adminFetch(
      `/api/admin/prompts/${id}`,
      {
        method:"PATCH",
        body:JSON.stringify({
          is_active
        })
      }
    )
  )
    showAdmin();

}


async function deletePrompt(id){

  if(!confirm(
    "Delete this prompt?"
  ))
    return;

  if(
    await adminFetch(
      `/api/admin/prompts/${id}`,
      {
        method:"DELETE"
      }
    )
  )
    showAdmin();

}


/* =========================================================
   PET COMPANION
   ========================================================= */

const petConfig={

  dog:{
    name:"Zeus",
    label:"loyal & warm",
    image:"/pets/dog.png.jfif"
  },

  cat:{
    name:"Luna",
    label:"calm & curious",
    image:"/pets/cat.png.jfif"
  },

  rabbit:{
    name:"Clover",
    label:"gentle & thoughtful",
    image:"/pets/rabit.png.jfif"
  },

  hamster:{
    name:"Pip",
    label:"tiny & cheerful",
    image:"/pets/hamster.png.jfif"
  },

  guinea:{
    name:"Mochi",
    label:"soft & comforting",
    image:"/pets/guinea-pig.png.jfif"
  },

  bird:{
    name:"Sky",
    label:"light & free",
    image:"/pets/bird.png.jfif"
  }

};


const petGreetings=[

  "I'm here whenever you feel like writing.",

  "A quiet thought is always worth keeping.",

  "How are you feeling today?",

  "You don't need perfect words here.",

  "Want to put one thought into words?",

  "Take your time. I'm not going anywhere."

];


const petWritingIdeas=[

  "What is something you wish you could say without explaining yourself?",

  "What made today feel a little different?",

  "Write about one small thing you want to remember.",

  "What has been on your mind lately?",

  "What would you tell yourself from one year ago?",

  "Describe a moment recently when you felt completely yourself.",

  "What is something you are quietly looking forward to?",

  "Write one page without worrying about how it sounds."

];


const petDayQuestions=[

  "What was the best part of your day?",

  "Was there something today you wish had gone differently?",

  "What made you smile today?",

  "What is one thing you're carrying with you tonight?",

  "If you had to describe today in one word, what would it be?",

  "Did anything surprise you today?"

];


let activePet=
  localStorage.getItem("qp_pet")||
  "dog";


/* =========================================================
   PET INITIALIZATION
   ========================================================= */

function initPet(){

  const dock=$("petDock");

  if(dock){

    renderPet();

    if(
      localStorage.getItem(
        "qp_pet_hidden"
      )==="true"
    ){

      dock.classList.add(
        "pet-hidden"
      );

    }

    renderPetMenu();

  }

  const introSeen=
    localStorage.getItem(
      "qp_pet_intro_v2_seen"
    );

  if(!introSeen){

    setTimeout(()=>{

      showPetIntroduction();

    },900);

  }

}


function renderPet(){

  const pet=
    petConfig[activePet]||
    petConfig.dog;

  const image=$("petImage");
  const name=$("petName");
  const fallback=$("petFallback");

  if(!image||!name)return;

  name.textContent=pet.name;

  image.src=pet.image;

  image.alt=
    `${pet.name}, your Quiet Pages companion`;

  image.style.display="block";

  if(fallback)
    fallback.style.display="none";

  image.onerror=function(){

    image.style.display="none";

    if(fallback){

      fallback.textContent=
        "Add your pet image";

      fallback.style.display="block";

    }

  };

  renderPetMenu();

}


function renderPetMenu(){

  const menu=$("petMenu");

  if(!menu)return;

  menu.innerHTML=`

    <div class="pet-menu-title">
      Choose your companion
    </div>

    ${
      Object.entries(petConfig)
        .map(
          ([key,pet])=>`

            <button
              class="pet-option ${
                activePet===key
                ?"active"
                :""
              }"
              onclick="
                choosePet('${key}')
              ">

              <img
                class="pet-option-image"
                src="${pet.image}"
                alt="${pet.name}"
                onerror="
                  this.style.opacity='.2'
                ">

              <span>

                <span class="pet-option-name">
                  ${pet.name}
                </span>

                <span class="pet-option-label">
                  ${pet.label}
                </span>

              </span>

            </button>

          `
        )
        .join("")
    }

  `;

}


function togglePetMenu(){

  const menu=$("petMenu");

  if(!menu)return;

  menu.classList.toggle(
    "hidden"
  );

  renderPetMenu();

}


function choosePet(key){

  if(!petConfig[key])
    return;

  activePet=key;

  localStorage.setItem(
    "qp_pet",
    key
  );

  localStorage.setItem(
    "qp_pet_hidden",
    "false"
  );

  localStorage.setItem(
    "qp_pet_intro_v2_seen",
    "true"
  );

  localStorage.setItem(
    "qp_pet_intro_seen",
    "true"
  );

  const dock=$("petDock");

  dock?.classList.remove(
    "pet-hidden"
  );

  renderPet();

  $("petMenu")?.classList.add(
    "hidden"
  );

  petSay(
    `Hi, I'm ${petConfig[key].name}. I'm happy to be your companion.`,
    "happy"
  );

  setTimeout(()=>{

    petSay(
      "Whenever you need a little writing inspiration, I'm here."
    );

  },3200);

}


function petSay(text,state="idle"){

  const bubble=$("petBubble");
  const dock=$("petDock");

  if(!bubble||!dock)return;

  bubble.textContent=text;

  dock.classList.remove(
    "is-happy",
    "is-thinking"
  );

  if(state!=="idle"){

    dock.classList.add(
      `is-${state}`
    );

    setTimeout(()=>{

      dock.classList.remove(
        `is-${state}`
      );

    },1500);

  }

}


function togglePet(){

  const dock=$("petDock");

  if(!dock)return;

  dock.classList.add(
    "pet-hidden"
  );

  localStorage.setItem(
    "qp_pet_hidden",
    "true"
  );

  toast(
    "Your companion is resting. You can bring them back from Pets."
  );

}


/* =========================================================
   PET NAVBAR PAGE
   ========================================================= */

function openPets(){

  const pet=
    petConfig[activePet]||
    petConfig.dog;

  openModal(`

    <div class="pet-intro">

      <span class="eyebrow">
        YOUR QUIET COMPANION
      </span>

      <div class="pet-intro-stage">

        <img
          class="pet-intro-image"
          src="${pet.image}"
          alt="${pet.name}"
          onerror="
            this.style.opacity='.2'
          ">

      </div>

      <h2>
        Meet ${pet.name}.
      </h2>

      <p>

        Your companion is here to make
        Quiet Pages feel a little more personal.

        They can give you writing ideas,
        ask about your day, and simply keep
        you company while you write.

      </p>

      <div class="pet-intro-note">

        You can change your companion whenever
        you want. Choose the little friend that
        feels right for your journaling space.

      </div>

      <button
        class="primary-btn magnetic"
        onclick="openPetChooser()">

        Change companion
        <span>↗</span>

      </button>

    </div>

  `);

}


function openPetChooser(){

  openModal(`

    <div class="pet-intro">

      <span class="eyebrow">
        CHOOSE YOUR COMPANION
      </span>

      <h2>
        Who should keep you company?
      </h2>

      <p>

        There is no right choice.
        Pick whichever feels most like
        the kind of company you'd like
        while writing.

      </p>

      <div class="pet-choice-grid">

        ${
          Object.entries(petConfig)
            .map(
              ([key,pet])=>`

                <button
                  class="pet-choice"
                  onclick="
                    selectPetFromModal('${key}')
                  ">

                  <img
                    src="${pet.image}"
                    alt="${pet.name}"
                    onerror="
                      this.style.opacity='.2'
                    ">

                  <strong>
                    ${pet.name}
                  </strong>

                  <small>
                    ${pet.label}
                  </small>

                </button>

              `
            )
            .join("")
        }

      </div>

    </div>

  `);

}


function selectPetFromModal(key){

  if(!petConfig[key])
    return;

  activePet=key;

  localStorage.setItem(
    "qp_pet",
    key
  );

  localStorage.setItem(
    "qp_pet_hidden",
    "false"
  );

  localStorage.setItem(
    "qp_pet_intro_v2_seen",
    "true"
  );

  localStorage.setItem(
    "qp_pet_intro_seen",
    "true"
  );

  closeModal();

  const dock=$("petDock");

  dock?.classList.remove(
    "pet-hidden"
  );

  renderPet();

  petSay(
    `Hi, I'm ${petConfig[key].name}. I'm your new companion.`,
    "happy"
  );

  setTimeout(()=>{

    petSay(
      "I'll be here whenever you need a little company."
    );

  },3000);

}


/* =========================================================
   FIRST VISIT PET INTRODUCTION
   ========================================================= */

function showPetIntroduction(){

  const pet=
    petConfig[activePet]||
    petConfig.dog;

  openModal(`

    <div class="pet-intro">

      <span class="eyebrow">
        WELCOME TO QUIET PAGES
      </span>

      <div class="pet-intro-stage">

        <img
          class="pet-intro-image"
          src="${pet.image}"
          alt="${pet.name}, Quiet Pages companion"
          onerror="
            this.style.opacity='.2'
          ">

      </div>

      <h2>
        Hi, I'm ${pet.name}. ♡
      </h2>

      <p>

        I'm here to accompany you while you
        write, listen to your thoughts, and make
        your journaling time feel a little more
        comforting.

      </p>

      <div class="pet-intro-note">

        You can choose your own pet from the
        <strong>Pet</strong> option and make them
        your personal writing companion.

      </div>

      <button
        class="primary-btn magnetic"
        onclick="openPetChooserFromIntro()">

        🐾 Choose Your Pet
        <span>↗</span>

      </button>

      <button
        class="text-link"
        style="margin:14px auto 0"
        onclick="continueWithoutChoosingPet()">

        I'll choose later

      </button>

    </div>

  `);

}


function openPetChooserFromIntro(){

  localStorage.setItem(
    "qp_pet_intro_v2_seen",
    "true"
  );

  openPetChooser();

}


function continueWithoutChoosingPet(){

  localStorage.setItem(
    "qp_pet_intro_v2_seen",
    "true"
  );

  localStorage.setItem(
    "qp_pet_intro_seen",
    "true"
  );

  closeModal();

  petSay(
    `I'll be right here whenever you're ready.`
  );

}


/* =========================================================
   PET IDLE MESSAGES
   ========================================================= */

let petIdleTimer;


function startPetIdleMessages(){

  clearInterval(
    petIdleTimer
  );

  petIdleTimer=setInterval(()=>{

    if(document.hidden)
      return;

    if(
      $("modal") &&
      !$("modal").classList.contains("hidden")
    )
      return;

    const message=
      petGreetings[
        Math.floor(
          Math.random()*
          petGreetings.length
        )
      ];

    petSay(message);

  },45000);

}


/* =========================================================
   VISUAL EFFECTS
   ========================================================= */

function initCursorGlow(){

  const glow=$("cursorGlow");

  if(!glow)return;

  if(
    window.matchMedia(
      "(pointer:coarse)"
    ).matches
  ){

    glow.style.display="none";

    return;

  }

  let x=-500;
  let y=-500;
  let targetX=-500;
  let targetY=-500;

  document.addEventListener(
    "pointermove",
    e=>{

      targetX=e.clientX;
      targetY=e.clientY;

      glow.style.opacity="1";

    }
  );

  document.addEventListener(
    "pointerleave",
    ()=>{

      glow.style.opacity="0";

    }
  );

  function animate(){

    x+=(targetX-x)*.12;
    y+=(targetY-y)*.12;

    glow.style.left=x+"px";
    glow.style.top=y+"px";

    requestAnimationFrame(
      animate
    );

  }

  animate();

}


function initParticles(){

  const container=$("qpParticles");

  if(!container)return;

  container.innerHTML="";

  for(let i=0;i<15;i++){

    const p=document.createElement("span");

    p.className="qp-particle";

    p.textContent=
      i%3===0
      ?"Q"
      :"✦";

    p.style.left=
      Math.random()*100+"%";

    p.style.top=
      100+Math.random()*20+"%";

    p.style.animationDuration=
      12+Math.random()*13+"s";

    p.style.animationDelay=
      Math.random()*10+"s";

    p.style.fontSize=
      8+Math.random()*8+"px";

    container.appendChild(p);

  }

}


function initRevealTargets(){

  const targets=document.querySelectorAll(
    ".reveal"
  );

  if(!("IntersectionObserver" in window)){

    targets.forEach(
      x=>x.classList.add("revealed")
    );

    return;

  }

  const observer=
    new IntersectionObserver(
      entries=>{

        entries.forEach(
          entry=>{

            if(
              entry.isIntersecting
            ){

              entry.target.classList.add(
                "revealed"
              );

              observer.unobserve(
                entry.target
              );

            }

          }
        );

      },
      {
        threshold:.12
      }
    );

  targets.forEach(
    x=>observer.observe(x)
  );

}


function initTiltCards(){

  const cards=document.querySelectorAll(
    ".tilt-card"
  );

  cards.forEach(card=>{

    if(card.dataset.tiltReady)
      return;

    card.dataset.tiltReady="true";

    card.addEventListener(
      "pointermove",
      e=>{

        if(
          window.matchMedia(
            "(pointer:coarse)"
          ).matches
        )
          return;

        const rect=
          card.getBoundingClientRect();

        const px=
          (e.clientX-rect.left)/
          rect.width;

        const py=
          (e.clientY-rect.top)/
          rect.height;

        const rotateY=
          (px-.5)*7;

        const rotateX=
          (py-.5)*-7;

        card.style.transform=
          `
          perspective(900px)
          rotateX(${rotateX}deg)
          rotateY(${rotateY}deg)
          translateY(-4px)
          scale(1.01)
          `;

      }
    );

    card.addEventListener(
      "pointerleave",
      ()=>{

        card.style.transform=
          "perspective(900px) rotateX(0) rotateY(0) translateY(0) scale(1)";

      }
    );

  });

}


function initMagnetic(){

  const elements=
    document.querySelectorAll(
      ".magnetic"
    );

  elements.forEach(el=>{

    if(el.dataset.magneticReady)
      return;

    el.dataset.magneticReady="true";

    el.addEventListener(
      "pointermove",
      e=>{

        if(
          window.matchMedia(
            "(pointer:coarse)"
          ).matches
        )
          return;

        const rect=
          el.getBoundingClientRect();

        const x=
          (
            e.clientX-
            (rect.left+rect.width/2)
          )*0.12;

        const y=
          (
            e.clientY-
            (rect.top+rect.height/2)
          )*0.12;

        el.style.transform=
          `translate(${x}px,${y}px)`;

      }
    );

    el.addEventListener(
      "pointerleave",
      ()=>{

        el.style.transform="";

      }
    );

  });

}


function initQuietEffects(){

  initCursorGlow();

  initParticles();

  initRevealTargets();

  initTiltCards();

  initMagnetic();

}


function refreshEffects(){

  setTimeout(()=>{

    initRevealTargets();

    initTiltCards();

    initMagnetic();

  },30);

}


/* =========================================================
   WRITING COMPANION
   IMAGE ONLY + FIXED TO WRITE PAGE BOTTOM RIGHT
   ========================================================= */

function moveWritingPet(){

  const pet=$("petWritingCompanion");
  const modalEl=$("modal");

  if(
    !pet ||
    pet.classList.contains("hidden") ||
    !modalEl ||
    !modalEl.classList.contains("writing-modal")
  ){
    return;
  }

  const card=modalEl.querySelector(".modal-card");

  if(!card)
    return;

  pet.style.position="absolute";
  pet.style.left="auto";
  pet.style.top="auto";
  pet.style.right="20px";
  pet.style.bottom="20px";

}


window.addEventListener(
  "resize",
  function(){

    moveWritingPet();

  }
);


function showWritingCompanion(message=""){

  const pet=$("petWritingCompanion");
  const img=$("petWritingImage");

  if(!pet || !img)
    return;

  const selected=
    localStorage.getItem("qp_pet")||
    activePet||
    "dog";

  const p=
    petConfig[selected]||
    petConfig.dog;

  img.src=p.image;

  img.alt=
    `${p.name}, your Quiet Pages writing companion`;

  const writingName=$("petWritingName");

  if(writingName)
    writingName.textContent=p.name;

  const card=
    modal?.querySelector(".modal-card");

  if(
    card &&
    pet.parentElement!==card
  ){

    card.appendChild(pet);

  }

  if(modal){

    modal.classList.add(
      "writing-modal"
    );

  }

  pet.classList.remove(
    "hidden"
  );

  pet.style.position="absolute";
  pet.style.left="auto";
  pet.style.top="auto";
  pet.style.right="20px";
  pet.style.bottom="20px";

  moveWritingPet();

}


function hideWritingCompanion(){

  const pet=$("petWritingCompanion");

  if(pet){

    pet.classList.add(
      "hidden"
    );

    pet.classList.remove(
      "pet-thinking",
      "pet-happy"
    );

    pet.style.left="";
    pet.style.right="";
    pet.style.top="";
    pet.style.bottom="";
    pet.style.position="";

  }

  if(modal){

    modal.classList.remove(
      "writing-modal"
    );

  }

}


function writingPetMessage(message){

  const pet=$("petWritingCompanion");

  if(!pet)
    return;

  pet.classList.remove(
    "pet-thinking"
  );

  void pet.offsetWidth;

  pet.classList.add(
    "pet-thinking"
  );

  clearTimeout(
    pet._thinkingTimer
  );

  pet._thinkingTimer=setTimeout(()=>{

    pet.classList.remove(
      "pet-thinking"
    );

  },1800);

}


document.addEventListener(
  "input",
  function(e){

    if(
      !e.target||
      e.target.id!=="diaryBody"
    )
      return;

    const value=
      e.target.value.trim();

    if(!value){

      writingPetMessage(
        "I'm here. Take your time."
      );

    }

    else if(value.length>120){

      writingPetMessage(
        "You're doing beautifully. Keep going."
      );

    }

    else if(value.length>30){

      writingPetMessage(
        "I like where this is going."
      );

    }

  }
);


/* =========================================================
   PET CONVERSATION
   ========================================================= */

let currentPetQuestion="";


function askPetQuestion(question){

  const bubble=$("petBubble");

  const answerBox=$("petAnswerBox");

  const input=$("petAnswerInput");

  currentPetQuestion=question;

  if(bubble)
    bubble.textContent=question;

  if(answerBox)
    answerBox.classList.remove("hidden");

  if(input){

    input.value="";

    setTimeout(()=>{
      input.focus();
    },150);

  }

}


function sendPetAnswer(){

  const input=$("petAnswerInput");

  const bubble=$("petBubble");

  const answerBox=$("petAnswerBox");

  if(!input)return;

  const answer=
    input.value.trim();

  if(!answer){

    input.focus();

    return;

  }

  const responses=[

    "Thank you for telling me. You can put more of that into a page if you want.",

    "I’m listening. Maybe this deserves a little more space.",

    "That sounds worth writing down.",

    "You don't have to make it perfect. Just keep going.",

    "I’m glad you told me."

  ];

  const response=
    responses[
      Math.floor(
        Math.random()*
        responses.length
      )
    ];

  if(bubble)
    bubble.textContent=response;

  input.value="";

  if(answerBox)
    answerBox.classList.add("hidden");

}


/* =========================================================
   PET QUESTIONS
   ========================================================= */

function petDayQuestion(){

  askPetQuestion(
    "How was your day? You can tell me anything."
  );

}


function petPrompt(){

  const prompts=[

    "What is something you haven't said out loud today?",

    "What made you smile recently?",

    "What is taking up space in your mind?",

    "What is one thing you want to remember about today?",

    "If today had a feeling, what would it be?"

  ];

  const question=
    prompts[
      Math.floor(
        Math.random()*
        prompts.length
      )
    ];

  askPetQuestion(question);

}


/* =========================================================
   PET ANSWER ENTER KEY
   ========================================================= */

document.addEventListener(
  "keydown",
  function(e){

    if(
      e.key==="Enter" &&
      !e.shiftKey &&
      e.target &&
      e.target.id==="petAnswerInput"
    ){

      e.preventDefault();

      sendPetAnswer();

    }

  }
);


/* =========================================================
   STARTUP
   ========================================================= */

applyTheme(
  localStorage.qp_theme||"light"
);

applyFont(
  localStorage.qp_font||"normal"
);

applyMotion(
  localStorage.qp_motion==="reduce"
);

updateNav();

initQuietEffects();

const dock=$("petDock");

if(dock){

  dock.classList.add(
    "pet-hidden"
  );

}

startPetIdleMessages();

setTimeout(()=>{

  openPets();

},900);

loadDiaries();