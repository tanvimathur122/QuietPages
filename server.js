const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Database = require("better-sqlite3");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "quiet-pages-change-this-secret";
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const db = new Database(path.join(__dirname, "quiet-pages.db"));
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
 password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', is_suspended INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS diaries (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
 is_public INTEGER NOT NULL DEFAULT 0, is_anonymous INTEGER NOT NULL DEFAULT 0,
 status TEXT NOT NULL DEFAULT 'published', mood TEXT, category TEXT, prompt TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS reports (
 id INTEGER PRIMARY KEY AUTOINCREMENT, diary_id INTEGER NOT NULL, reporter_id INTEGER,
 reason TEXT NOT NULL, details TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'open',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at TEXT,
 FOREIGN KEY(diary_id) REFERENCES diaries(id) ON DELETE CASCADE,
 FOREIGN KEY(reporter_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS prompts (
 id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL UNIQUE, category TEXT DEFAULT 'Reflection',
 is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS user_profiles (user_id INTEGER PRIMARY KEY, bio TEXT DEFAULT '', FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE IF NOT EXISTS bookmarks (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, diary_id INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(user_id, diary_id),
 FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(diary_id) REFERENCES diaries(id) ON DELETE CASCADE
);
`);

function ensureColumn(table, name, definition) {
 const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
 if (!cols.includes(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
}
ensureColumn("users", "role", "TEXT NOT NULL DEFAULT 'user'");
ensureColumn("users", "is_suspended", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("diaries", "is_anonymous", "INTEGER NOT NULL DEFAULT 0");
ensureColumn("diaries", "status", "TEXT NOT NULL DEFAULT 'published'");
ensureColumn("diaries", "mood", "TEXT");
ensureColumn("diaries", "category", "TEXT");
ensureColumn("diaries", "prompt", "TEXT");
ensureColumn("diaries", "updated_at", "TEXT");
db.prepare("UPDATE diaries SET updated_at=created_at WHERE updated_at IS NULL").run();
if (ADMIN_EMAIL) db.prepare("UPDATE users SET role='admin' WHERE lower(email)=?").run(ADMIN_EMAIL);

const defaultPrompts = [
 ["What made you smile today?", "Gratitude"],
 ["What is taking up the most space in your mind right now?", "Reflection"],
 ["Describe today in three words.", "Daily check-in"],
 ["What are you proud of yourself for?", "Self"],
 ["What do you need to hear today?", "Self-care"],
 ["If you could pause one moment from today, which would it be?", "Memory"]
];
const addPrompt = db.prepare("INSERT OR IGNORE INTO prompts (text,category) VALUES (?,?)");
for (const p of defaultPrompts) addPrompt.run(...p);

app.use(express.json({limit:"1mb"}));
app.use(express.static(path.join(__dirname,"public")));
function createToken(user){ return jwt.sign({id:user.id,name:user.name,email:user.email,role:user.role},JWT_SECRET,{expiresIn:"7d"}); }
function auth(req,res,next){
 const h=req.headers.authorization||"", token=h.startsWith("Bearer ")?h.slice(7):null;
 if(!token) return res.status(401).json({error:"Please sign in first."});
 try{
  const decoded=jwt.verify(token,JWT_SECRET);
  const user=db.prepare("SELECT id,name,email,role,is_suspended FROM users WHERE id=?").get(decoded.id);
  if(!user) return res.status(401).json({error:"Account not found."});
  if(user.is_suspended) return res.status(403).json({error:"This account is currently suspended."});
  req.user=user; next();
 }catch{ return res.status(401).json({error:"Session expired. Please sign in again."}); }
}
function admin(req,res,next){ if(req.user.role!=="admin") return res.status(403).json({error:"Admin access required."}); next(); }
function validMood(m){ return ["great","good","okay","low","difficult"].includes(m); }
function validCategory(c){ return ["Free Write","Gratitude","Daily Check-in","Memories","Thoughts","Goals"].includes(c); }

app.post("/api/signup",async(req,res)=>{
 const {name,email,password}=req.body;
 if(!name||!email||!password) return res.status(400).json({error:"All fields are required."});
 if(password.length<6) return res.status(400).json({error:"Password must be at least 6 characters."});
 const normalized=email.trim().toLowerCase();
 try{
  const hash=await bcrypt.hash(password,10), role=ADMIN_EMAIL&&normalized===ADMIN_EMAIL?"admin":"user";
  const r=db.prepare("INSERT INTO users (name,email,password,role) VALUES (?,?,?,?)").run(name.trim(),normalized,hash,role);
  db.prepare("INSERT OR IGNORE INTO user_profiles (user_id) VALUES (?)").run(r.lastInsertRowid);
  const user=db.prepare("SELECT id,name,email,role FROM users WHERE id=?").get(r.lastInsertRowid);
  res.json({token:createToken(user),user});
 }catch{res.status(409).json({error:"That email is already registered."});}
});
app.post("/api/login",async(req,res)=>{
 const email=(req.body.email||"").trim().toLowerCase(), user=db.prepare("SELECT * FROM users WHERE email=?").get(email);
 if(!user||!(await bcrypt.compare(req.body.password||"",user.password))) return res.status(401).json({error:"Invalid email or password."});
 if(user.is_suspended) return res.status(403).json({error:"This account is currently suspended."});
 db.prepare("INSERT OR IGNORE INTO user_profiles (user_id) VALUES (?)").run(user.id);
 const safe={id:user.id,name:user.name,email:user.email,role:user.role}; res.json({token:createToken(safe),user:safe});
});
app.get("/api/me",auth,(req,res)=>res.json({user:db.prepare("SELECT id,name,email,role,created_at FROM users WHERE id=?").get(req.user.id)}));

app.get("/api/prompts",(req,res)=>{
 const category=(req.query.category||"").trim();
 const rows=category?db.prepare("SELECT id,text,category FROM prompts WHERE is_active=1 AND category=? ORDER BY id").all(category):db.prepare("SELECT id,text,category FROM prompts WHERE is_active=1 ORDER BY id").all();
 res.json({prompts:rows});
});
app.get("/api/prompts/random",(req,res)=>{const p=db.prepare("SELECT id,text,category FROM prompts WHERE is_active=1 ORDER BY RANDOM() LIMIT 1").get();res.json({prompt:p||null});});

app.get("/api/diaries",(req,res)=>{
 const search=(req.query.search||"").trim();
 const category=(req.query.category||"").trim();
 const mood=(req.query.mood||"").trim();
 let sql=`SELECT d.id,d.title,d.body,d.created_at,d.is_anonymous,d.mood,d.category,CASE WHEN d.is_anonymous=1 THEN 'Anonymous' ELSE u.name END author FROM diaries d JOIN users u ON u.id=d.user_id WHERE d.is_public=1 AND d.status='published'`;
 const params=[];
 if(search){sql+=" AND (d.title LIKE ? OR d.body LIKE ? OR (d.is_anonymous=0 AND u.name LIKE ?))";params.push(`%${search}%`,`%${search}%`,`%${search}%`);}
 if(category){sql+=" AND d.category=?";params.push(category);} if(mood){sql+=" AND d.mood=?";params.push(mood);}
 sql+=" ORDER BY d.created_at DESC"; res.json({diaries:db.prepare(sql).all(...params)});
});
app.get("/api/diaries/:id",(req,res)=>{
 const d=db.prepare(`SELECT d.id,d.title,d.body,d.created_at,d.is_public,d.is_anonymous,d.mood,d.category,d.prompt,CASE WHEN d.is_anonymous=1 THEN 'Anonymous' ELSE u.name END author FROM diaries d JOIN users u ON u.id=d.user_id WHERE d.id=? AND d.status='published'`).get(req.params.id);
 if(!d||!d.is_public)return res.status(404).json({error:"Diary not found."}); res.json({diary:d});
});
app.post("/api/diaries",auth,(req,res)=>{
 const {title,body,visibility="private",mood=null,category="Free Write",prompt=null}=req.body;
 if(!title?.trim()||!body?.trim())return res.status(400).json({error:"Title and diary text are required."});
 if(!["private","public","anonymous"].includes(visibility))return res.status(400).json({error:"Choose a valid privacy option."});
 if(mood&&!validMood(mood))return res.status(400).json({error:"Choose a valid mood."});
 if(!validCategory(category))return res.status(400).json({error:"Choose a valid category."});
 const pub=visibility!=="private"?1:0, anon=visibility==="anonymous"?1:0;
 const r=db.prepare("INSERT INTO diaries (user_id,title,body,is_public,is_anonymous,mood,category,prompt) VALUES (?,?,?,?,?,?,?,?)").run(req.user.id,title.trim(),body.trim(),pub,anon,mood||null,category,prompt||null);
 const d=db.prepare(`SELECT d.id,d.title,d.body,d.created_at,d.is_public,d.is_anonymous,d.mood,d.category,d.prompt,CASE WHEN d.is_anonymous=1 THEN 'Anonymous' ELSE u.name END author FROM diaries d JOIN users u ON u.id=d.user_id WHERE d.id=?`).get(r.lastInsertRowid);
 res.status(201).json({diary:d});
});
app.get("/api/my-diaries",auth,(req,res)=>res.json({diaries:db.prepare("SELECT id,title,body,created_at,is_public,is_anonymous,status,mood,category,prompt FROM diaries WHERE user_id=? ORDER BY created_at DESC").all(req.user.id)}));
app.delete("/api/diaries/:id",auth,(req,res)=>{const r=db.prepare("DELETE FROM diaries WHERE id=? AND user_id=?").run(req.params.id,req.user.id);if(!r.changes)return res.status(404).json({error:"Diary not found."});res.json({message:"Diary deleted."});});
app.post("/api/diaries/:id/report",auth,(req,res)=>{const {reason,details=""}=req.body,d=db.prepare("SELECT id,is_public,status FROM diaries WHERE id=?").get(req.params.id);if(!d||!d.is_public||d.status!=="published")return res.status(404).json({error:"Diary not found."});if(!reason?.trim())return res.status(400).json({error:"Please choose a reason."});db.prepare("INSERT INTO reports (diary_id,reporter_id,reason,details) VALUES (?,?,?,?)").run(req.params.id,req.user.id,reason.trim(),String(details).trim());res.json({message:"Report received. Thank you for helping keep Quiet Pages kind."});});


app.patch("/api/profile",auth,(req,res)=>{
 const name=String(req.body.name||"").trim(), bio=String(req.body.bio||"").trim();
 if(!name)return res.status(400).json({error:"Pen name cannot be empty."});
 if(name.length>40||bio.length>160)return res.status(400).json({error:"Please keep your profile text shorter."});
 db.prepare("UPDATE users SET name=? WHERE id=?").run(name,req.user.id);
 db.prepare("INSERT OR IGNORE INTO user_profiles (user_id) VALUES (?)").run(req.user.id);
 db.prepare("UPDATE user_profiles SET bio=? WHERE user_id=?").run(bio,req.user.id);
 const user=db.prepare("SELECT id,name,email,role,created_at FROM users WHERE id=?").get(req.user.id);
 res.json({user});
});
app.get("/api/profile",auth,(req,res)=>{
 const user=db.prepare("SELECT id,name,email,role,created_at FROM users WHERE id=?").get(req.user.id);
 const bio=db.prepare("SELECT bio FROM user_profiles WHERE user_id=?").get(req.user.id)?.bio||"";
 res.json({user,bio});
});
app.get("/api/stats/me",auth,(req,res)=>{
 const rows=db.prepare("SELECT created_at FROM diaries WHERE user_id=? AND status='published' ORDER BY created_at DESC").all(req.user.id);
 const days=new Set(rows.map(x=>x.created_at.slice(0,10)));
 let streak=0; let d=new Date();
 while(days.has(d.toISOString().slice(0,10))){streak++;d.setUTCDate(d.getUTCDate()-1);}
 let longest=0,run=0,prev=null;
 [...days].sort().forEach(x=>{const cur=new Date(x); if(prev){const diff=(cur-prev)/86400000;run=diff===1?run+1:1}else run=1; longest=Math.max(longest,run);prev=cur;});
 const total=rows.length;
 res.json({total,currentStreak:streak,longestStreak:longest});
});
app.put("/api/diaries/:id",auth,(req,res)=>{
 const {title,body,visibility="private",mood=null,category="Free Write",prompt=null,status="published"}=req.body;
 const old=db.prepare("SELECT * FROM diaries WHERE id=? AND user_id=?").get(req.params.id,req.user.id);
 if(!old)return res.status(404).json({error:"Diary not found."});
 if(!title?.trim()||!body?.trim())return res.status(400).json({error:"Title and diary text are required."});
 if(!["private","public","anonymous"].includes(visibility))return res.status(400).json({error:"Choose a valid privacy option."});
 if(mood&&!validMood(mood))return res.status(400).json({error:"Choose a valid mood."});
 if(!validCategory(category))return res.status(400).json({error:"Choose a valid category."});
 const pub=visibility!=="private"?1:0,anon=visibility==="anonymous"?1:0;
 const safeStatus=status==="draft"?"draft":"published";
 db.prepare("UPDATE diaries SET title=?,body=?,is_public=?,is_anonymous=?,mood=?,category=?,prompt=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").run(title.trim(),body.trim(),pub,anon,mood||null,category,prompt||null,safeStatus,req.params.id,req.user.id);
 const d=db.prepare("SELECT id,title,body,created_at,updated_at,is_public,is_anonymous,status,mood,category,prompt FROM diaries WHERE id=?").get(req.params.id);
 res.json({diary:d});
});
app.post("/api/diaries/:id/bookmark",auth,(req,res)=>{
 const d=db.prepare("SELECT id FROM diaries WHERE id=? AND is_public=1 AND status='published'").get(req.params.id); if(!d)return res.status(404).json({error:"Diary not found."});
 try{db.prepare("INSERT INTO bookmarks(user_id,diary_id) VALUES(?,?)").run(req.user.id,req.params.id);}catch{}
 res.json({bookmarked:true});
});
app.delete("/api/diaries/:id/bookmark",auth,(req,res)=>{db.prepare("DELETE FROM bookmarks WHERE user_id=? AND diary_id=?").run(req.user.id,req.params.id);res.json({bookmarked:false});});
app.get("/api/bookmarks",auth,(req,res)=>res.json({diaries:db.prepare("SELECT d.id,d.title,d.body,d.created_at,d.is_anonymous,d.mood,d.category,CASE WHEN d.is_anonymous=1 THEN 'Anonymous' ELSE u.name END author FROM bookmarks b JOIN diaries d ON d.id=b.diary_id JOIN users u ON u.id=d.user_id WHERE b.user_id=? AND d.is_public=1 AND d.status='published' ORDER BY b.created_at DESC").all(req.user.id)}));
app.get("/api/diaries/:id/bookmark",auth,(req,res)=>res.json({bookmarked:!!db.prepare("SELECT 1 FROM bookmarks WHERE user_id=? AND diary_id=?").get(req.user.id,req.params.id)}));
app.get("/api/admin/stats",auth,admin,(req,res)=>{const c=q=>db.prepare(q).get().count;res.json({stats:{users:c("SELECT COUNT(*) count FROM users"),entries:c("SELECT COUNT(*) count FROM diaries"),anonymous:c("SELECT COUNT(*) count FROM diaries WHERE is_anonymous=1"),reports:c("SELECT COUNT(*) count FROM reports WHERE status='open'"),publicEntries:c("SELECT COUNT(*) count FROM diaries WHERE is_public=1 AND status='published'"),moods:c("SELECT COUNT(*) count FROM diaries WHERE mood IS NOT NULL"),prompts:c("SELECT COUNT(*) count FROM prompts WHERE is_active=1")}});});
app.get("/api/admin/analytics",auth,admin,(req,res)=>{
 const moods=db.prepare("SELECT COALESCE(mood,'none') mood,COUNT(*) count FROM diaries GROUP BY mood ORDER BY count DESC").all();
 const categories=db.prepare("SELECT COALESCE(category,'Uncategorised') category,COUNT(*) count FROM diaries GROUP BY category ORDER BY count DESC").all();
 const trend=db.prepare("SELECT substr(created_at,1,10) day,COUNT(*) count FROM diaries GROUP BY day ORDER BY day DESC LIMIT 14").all().reverse();
 res.json({moods,categories,trend});
});
app.get("/api/admin/prompts",auth,admin,(req,res)=>res.json({prompts:db.prepare("SELECT * FROM prompts ORDER BY id DESC").all()}));
app.post("/api/admin/prompts",auth,admin,(req,res)=>{const text=String(req.body.text||"").trim(),category=String(req.body.category||"Reflection").trim();if(!text)return res.status(400).json({error:"Prompt text is required."});try{const r=db.prepare("INSERT INTO prompts (text,category) VALUES (?,?)").run(text,category);res.status(201).json({prompt:db.prepare("SELECT * FROM prompts WHERE id=?").get(r.lastInsertRowid)});}catch{res.status(409).json({error:"That prompt already exists."});}});
app.patch("/api/admin/prompts/:id",auth,admin,(req,res)=>{const active=req.body.is_active;const r=db.prepare("UPDATE prompts SET is_active=? WHERE id=?").run(active?1:0,req.params.id);if(!r.changes)return res.status(404).json({error:"Prompt not found."});res.json({message:"Prompt updated."});});
app.delete("/api/admin/prompts/:id",auth,admin,(req,res)=>{const r=db.prepare("DELETE FROM prompts WHERE id=?").run(req.params.id);if(!r.changes)return res.status(404).json({error:"Prompt not found."});res.json({message:"Prompt deleted."});});
app.get("/api/admin/users",auth,admin,(req,res)=>res.json({users:db.prepare(`SELECT u.id,u.name,u.email,u.role,u.is_suspended,u.created_at,COUNT(d.id) entries FROM users u LEFT JOIN diaries d ON d.user_id=u.id GROUP BY u.id ORDER BY u.created_at DESC`).all()}));
app.patch("/api/admin/users/:id",auth,admin,(req,res)=>{const {suspended,role}=req.body,t=db.prepare("SELECT id,role FROM users WHERE id=?").get(req.params.id);if(!t)return res.status(404).json({error:"User not found."});if(t.id===req.user.id&&(suspended||role==="user"))return res.status(400).json({error:"You cannot remove your own admin access."});if(role&&!['user','admin'].includes(role))return res.status(400).json({error:"Invalid role."});db.prepare("UPDATE users SET is_suspended=COALESCE(?,is_suspended),role=COALESCE(?,role) WHERE id=?").run(typeof suspended==='boolean'?(suspended?1:0):null,role||null,req.params.id);res.json({message:"User updated."});});
app.delete("/api/admin/users/:id",auth,admin,(req,res)=>{if(Number(req.params.id)===req.user.id)return res.status(400).json({error:"You cannot delete your own account here."});const r=db.prepare("DELETE FROM users WHERE id=?").run(req.params.id);if(!r.changes)return res.status(404).json({error:"User not found."});res.json({message:"User deleted."});});
app.get("/api/admin/entries",auth,admin,(req,res)=>res.json({entries:db.prepare(`SELECT d.id,d.title,d.body,d.created_at,d.is_public,d.is_anonymous,d.status,d.mood,d.category,u.name owner,u.email FROM diaries d JOIN users u ON u.id=d.user_id ORDER BY d.created_at DESC`).all()}));
app.delete("/api/admin/entries/:id",auth,admin,(req,res)=>{const r=db.prepare("UPDATE diaries SET status='removed',is_public=0 WHERE id=?").run(req.params.id);if(!r.changes)return res.status(404).json({error:"Entry not found."});res.json({message:"Entry removed from public view."});});
app.get("/api/admin/reports",auth,admin,(req,res)=>res.json({reports:db.prepare(`SELECT r.*,d.title,d.is_anonymous,u.name reporter FROM reports r JOIN diaries d ON d.id=r.diary_id LEFT JOIN users u ON u.id=r.reporter_id ORDER BY CASE WHEN r.status='open' THEN 0 ELSE 1 END,r.created_at DESC`).all()}));
app.patch("/api/admin/reports/:id",auth,admin,(req,res)=>{const status=req.body.status;if(!['open','resolved','dismissed'].includes(status))return res.status(400).json({error:"Invalid report status."});db.prepare("UPDATE reports SET status=?,resolved_at=? WHERE id=?").run(status,status==='open'?null:new Date().toISOString(),req.params.id);res.json({message:"Report updated."});});

app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`Quiet Pages running at http://localhost:${PORT}`));
