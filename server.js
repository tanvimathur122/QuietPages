require("dotenv").config();

const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();

const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();

if (!DATABASE_URL) {
  console.error("DATABASE_URL is missing.");
  process.exit(1);
}

if (!JWT_SECRET || JWT_SECRET.length < 16) {
  console.error("JWT_SECRET is missing or too short.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

async function query(text, params = []) {
  return pool.query(text, params);
}

async function initDatabase() {
  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      is_suspended INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS diaries (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      is_public INTEGER NOT NULL DEFAULT 0,
      is_anonymous INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'published',
      mood TEXT,
      category TEXT,
      prompt TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      diary_id INTEGER NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
      reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      details TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS prompts (
      id SERIAL PRIMARY KEY,
      text TEXT NOT NULL UNIQUE,
      category TEXT DEFAULT 'Reflection',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      bio TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      diary_id INTEGER NOT NULL REFERENCES diaries(id) ON DELETE CASCADE,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, diary_id)
    );
  `);

  const prompts = [
    ["What made you smile today?", "Gratitude"],
    ["What is taking up the most space in your mind right now?", "Reflection"],
    ["Describe today in three words.", "Daily check-in"],
    ["What are you proud of yourself for?", "Self"],
    ["What do you need to hear today?", "Self-care"],
    ["If you could pause one moment from today, which would it be?", "Memory"]
  ];

  for (const [text, category] of prompts) {
    await query(
      `INSERT INTO prompts (text, category)
       VALUES ($1, $2)
       ON CONFLICT (text) DO NOTHING`,
      [text, category]
    );
  }

  if (ADMIN_EMAIL) {
    await query(
      `UPDATE users SET role='admin' WHERE LOWER(email)=$1`,
      [ADMIN_EMAIL]
    );
  }

  console.log("Database initialized.");
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

async function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ")
    ? header.slice(7)
    : null;

  if (!token) {
    return res.status(401).json({ error: "Please sign in first." });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    const result = await query(
      `SELECT id,name,email,role,is_suspended
       FROM users WHERE id=$1`,
      [decoded.id]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: "Account not found." });
    }

    if (user.is_suspended) {
      return res.status(403).json({
        error: "This account is currently suspended."
      });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({
      error: "Session expired. Please sign in again."
    });
  }
}

function admin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({
      error: "Admin access required."
    });
  }
  next();
}

function validMood(m) {
  return ["great", "good", "okay", "low", "difficult"].includes(m);
}

function validCategory(c) {
  return [
    "Free Write",
    "Gratitude",
    "Daily Check-in",
    "Memories",
    "Thoughts",
    "Goals"
  ].includes(c);
}

app.get("/health", async (req, res) => {
  try {
    await query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch {
    res.status(503).json({
      status: "error",
      database: "disconnected"
    });
  }
});

app.post("/api/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: "All fields are required."
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters."
      });
    }

    const normalized = email.trim().toLowerCase();
    const hash = await bcrypt.hash(password, 10);

    const role =
      ADMIN_EMAIL && normalized === ADMIN_EMAIL
        ? "admin"
        : "user";

    const result = await query(
      `INSERT INTO users (name,email,password,role)
       VALUES ($1,$2,$3,$4)
       RETURNING id,name,email,role`,
      [name.trim(), normalized, hash, role]
    );

    const user = result.rows[0];

    await query(
      `INSERT INTO user_profiles (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id]
    );

    res.json({
      token: createToken(user),
      user
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        error: "That email is already registered."
      });
    }

    console.error(err);
    res.status(500).json({ error: "Signup failed." });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const email = (req.body.email || "").trim().toLowerCase();

    const result = await query(
      `SELECT * FROM users WHERE email=$1`,
      [email]
    );

    const user = result.rows[0];

    if (
      !user ||
      !(await bcrypt.compare(req.body.password || "", user.password))
    ) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    if (user.is_suspended) {
      return res.status(403).json({
        error: "This account is currently suspended."
      });
    }

    await query(
      `INSERT INTO user_profiles (user_id)
       VALUES ($1)
       ON CONFLICT (user_id) DO NOTHING`,
      [user.id]
    );

    const safe = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    res.json({
      token: createToken(safe),
      user: safe
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed." });
  }
});

app.get("/api/me", auth, async (req, res) => {
  const result = await query(
    `SELECT id,name,email,role,created_at
     FROM users WHERE id=$1`,
    [req.user.id]
  );

  res.json({ user: result.rows[0] });
});

app.get("/api/prompts", async (req, res) => {
  const category = (req.query.category || "").trim();

  const result = category
    ? await query(
        `SELECT id,text,category
         FROM prompts
         WHERE is_active=1 AND category=$1
         ORDER BY id`,
        [category]
      )
    : await query(
        `SELECT id,text,category
         FROM prompts
         WHERE is_active=1
         ORDER BY id`
      );

  res.json({ prompts: result.rows });
});

app.get("/api/prompts/random", async (req, res) => {
  const result = await query(
    `SELECT id,text,category
     FROM prompts
     WHERE is_active=1
     ORDER BY RANDOM()
     LIMIT 1`
  );

  res.json({ prompt: result.rows[0] || null });
});

app.get("/api/diaries", async (req, res) => {
  const search = (req.query.search || "").trim();
  const category = (req.query.category || "").trim();
  const mood = (req.query.mood || "").trim();

  let sql = `
    SELECT
      d.id,d.title,d.body,d.created_at,
      d.is_anonymous,d.mood,d.category,
      CASE
        WHEN d.is_anonymous=1 THEN 'Anonymous'
        ELSE u.name
      END author
    FROM diaries d
    JOIN users u ON u.id=d.user_id
    WHERE d.is_public=1
      AND d.status='published'
  `;

  const params = [];

  if (search) {
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    sql += `
      AND (
        d.title ILIKE $${params.length - 2}
        OR d.body ILIKE $${params.length - 1}
        OR (
          d.is_anonymous=0
          AND u.name ILIKE $${params.length}
        )
      )
    `;
  }

  if (category) {
    params.push(category);
    sql += ` AND d.category=$${params.length}`;
  }

  if (mood) {
    params.push(mood);
    sql += ` AND d.mood=$${params.length}`;
  }

  sql += ` ORDER BY d.created_at DESC`;

  const result = await query(sql, params);

  res.json({ diaries: result.rows });
});

app.get("/api/diaries/:id", async (req, res) => {
  const result = await query(
    `SELECT
      d.id,d.title,d.body,d.created_at,
      d.is_public,d.is_anonymous,
      d.mood,d.category,d.prompt,
      CASE
        WHEN d.is_anonymous=1 THEN 'Anonymous'
        ELSE u.name
      END author
     FROM diaries d
     JOIN users u ON u.id=d.user_id
     WHERE d.id=$1 AND d.status='published'`,
    [req.params.id]
  );

  const diary = result.rows[0];

  if (!diary || !diary.is_public) {
    return res.status(404).json({
      error: "Diary not found."
    });
  }

  res.json({ diary });
});

app.post("/api/diaries", auth, async (req, res) => {
  try {
    const {
      title,
      body,
      visibility = "private",
      mood = null,
      category = "Free Write",
      prompt = null
    } = req.body;

    if (!title?.trim() || !body?.trim()) {
      return res.status(400).json({
        error: "Title and diary text are required."
      });
    }

    if (!["private", "public", "anonymous"].includes(visibility)) {
      return res.status(400).json({
        error: "Choose a valid privacy option."
      });
    }

    if (mood && !validMood(mood)) {
      return res.status(400).json({
        error: "Choose a valid mood."
      });
    }

    if (!validCategory(category)) {
      return res.status(400).json({
        error: "Choose a valid category."
      });
    }

    const pub = visibility !== "private" ? 1 : 0;
    const anon = visibility === "anonymous" ? 1 : 0;

    const result = await query(
      `INSERT INTO diaries
       (user_id,title,body,is_public,is_anonymous,mood,category,prompt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id`,
      [
        req.user.id,
        title.trim(),
        body.trim(),
        pub,
        anon,
        mood || null,
        category,
        prompt || null
      ]
    );

    const diary = await query(
      `SELECT
        d.id,d.title,d.body,d.created_at,
        d.is_public,d.is_anonymous,d.mood,d.category,d.prompt,
        CASE
          WHEN d.is_anonymous=1 THEN 'Anonymous'
          ELSE u.name
        END author
       FROM diaries d
       JOIN users u ON u.id=d.user_id
       WHERE d.id=$1`,
      [result.rows[0].id]
    );

    res.status(201).json({
      diary: diary.rows[0]
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Could not save diary."
    });
  }
});

app.get("/api/my-diaries", auth, async (req, res) => {
  const result = await query(
    `SELECT id,title,body,created_at,
            is_public,is_anonymous,status,
            mood,category,prompt
     FROM diaries
     WHERE user_id=$1
     ORDER BY created_at DESC`,
    [req.user.id]
  );

  res.json({ diaries: result.rows });
});

app.delete("/api/diaries/:id", auth, async (req, res) => {
  const result = await query(
    `DELETE FROM diaries
     WHERE id=$1 AND user_id=$2
     RETURNING id`,
    [req.params.id, req.user.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({
      error: "Diary not found."
    });
  }

  res.json({ message: "Diary deleted." });
});

app.post("/api/diaries/:id/report", auth, async (req, res) => {
  const { reason, details = "" } = req.body;

  const diaryResult = await query(
    `SELECT id,is_public,status
     FROM diaries WHERE id=$1`,
    [req.params.id]
  );

  const diary = diaryResult.rows[0];

  if (!diary || !diary.is_public || diary.status !== "published") {
    return res.status(404).json({
      error: "Diary not found."
    });
  }

  if (!reason?.trim()) {
    return res.status(400).json({
      error: "Please choose a reason."
    });
  }

  await query(
    `INSERT INTO reports
     (diary_id,reporter_id,reason,details)
     VALUES ($1,$2,$3,$4)`,
    [
      req.params.id,
      req.user.id,
      reason.trim(),
      String(details).trim()
    ]
  );

  res.json({
    message:
      "Report received. Thank you for helping keep Quiet Pages kind."
  });
});

app.patch("/api/profile", auth, async (req, res) => {
  const name = String(req.body.name || "").trim();
  const bio = String(req.body.bio || "").trim();

  if (!name) {
    return res.status(400).json({
      error: "Pen name cannot be empty."
    });
  }

  if (name.length > 40 || bio.length > 160) {
    return res.status(400).json({
      error: "Please keep your profile text shorter."
    });
  }

  await query(
    `UPDATE users SET name=$1 WHERE id=$2`,
    [name, req.user.id]
  );

  await query(
    `INSERT INTO user_profiles (user_id,bio)
     VALUES ($1,$2)
     ON CONFLICT (user_id)
     DO UPDATE SET bio=EXCLUDED.bio`,
    [req.user.id, bio]
  );

  const result = await query(
    `SELECT id,name,email,role,created_at
     FROM users WHERE id=$1`,
    [req.user.id]
  );

  res.json({ user: result.rows[0] });
});

app.get("/api/profile", auth, async (req, res) => {
  const userResult = await query(
    `SELECT id,name,email,role,created_at
     FROM users WHERE id=$1`,
    [req.user.id]
  );

  const profileResult = await query(
    `SELECT bio FROM user_profiles WHERE user_id=$1`,
    [req.user.id]
  );

  res.json({
    user: userResult.rows[0],
    bio: profileResult.rows[0]?.bio || ""
  });
});

app.get("/api/stats/me", auth, async (req, res) => {
  const result = await query(
    `SELECT created_at
     FROM diaries
     WHERE user_id=$1 AND status='published'
     ORDER BY created_at DESC`,
    [req.user.id]
  );

  const days = new Set(
    result.rows.map(x =>
      new Date(x.created_at).toISOString().slice(0, 10)
    )
  );

  let streak = 0;
  let d = new Date();

  while (days.has(d.toISOString().slice(0, 10))) {
    streak++;
    d.setUTCDate(d.getUTCDate() - 1);
  }

  let longest = 0;
  let run = 0;
  let prev = null;

  [...days].sort().forEach(x => {
    const cur = new Date(x);

    if (prev) {
      const diff = (cur - prev) / 86400000;
      run = diff === 1 ? run + 1 : 1;
    } else {
      run = 1;
    }

    longest = Math.max(longest, run);
    prev = cur;
  });

  res.json({
    total: result.rows.length,
    currentStreak: streak,
    longestStreak: longest
  });
});

app.put("/api/diaries/:id", auth, async (req, res) => {
  const {
    title,
    body,
    visibility = "private",
    mood = null,
    category = "Free Write",
    prompt = null,
    status = "published"
  } = req.body;

  const oldResult = await query(
    `SELECT * FROM diaries
     WHERE id=$1 AND user_id=$2`,
    [req.params.id, req.user.id]
  );

  if (!oldResult.rows[0]) {
    return res.status(404).json({
      error: "Diary not found."
    });
  }

  if (!title?.trim() || !body?.trim()) {
    return res.status(400).json({
      error: "Title and diary text are required."
    });
  }

  if (!["private", "public", "anonymous"].includes(visibility)) {
    return res.status(400).json({
      error: "Choose a valid privacy option."
    });
  }

  if (mood && !validMood(mood)) {
    return res.status(400).json({
      error: "Choose a valid mood."
    });
  }

  if (!validCategory(category)) {
    return res.status(400).json({
      error: "Choose a valid category."
    });
  }

  const pub = visibility !== "private" ? 1 : 0;
  const anon = visibility === "anonymous" ? 1 : 0;
  const safeStatus = status === "draft" ? "draft" : "published";

  await query(
    `UPDATE diaries
     SET title=$1,
         body=$2,
         is_public=$3,
         is_anonymous=$4,
         mood=$5,
         category=$6,
         prompt=$7,
         status=$8,
         updated_at=CURRENT_TIMESTAMP
     WHERE id=$9 AND user_id=$10`,
    [
      title.trim(),
      body.trim(),
      pub,
      anon,
      mood || null,
      category,
      prompt || null,
      safeStatus,
      req.params.id,
      req.user.id
    ]
  );

  const result = await query(
    `SELECT id,title,body,created_at,updated_at,
            is_public,is_anonymous,status,mood,category,prompt
     FROM diaries WHERE id=$1`,
    [req.params.id]
  );

  res.json({ diary: result.rows[0] });
});

app.post("/api/diaries/:id/bookmark", auth, async (req, res) => {
  const diary = await query(
    `SELECT id FROM diaries
     WHERE id=$1 AND is_public=1 AND status='published'`,
    [req.params.id]
  );

  if (!diary.rows[0]) {
    return res.status(404).json({
      error: "Diary not found."
    });
  }

  await query(
    `INSERT INTO bookmarks (user_id,diary_id)
     VALUES ($1,$2)
     ON CONFLICT (user_id,diary_id) DO NOTHING`,
    [req.user.id, req.params.id]
  );

  res.json({ bookmarked: true });
});

app.delete("/api/diaries/:id/bookmark", auth, async (req, res) => {
  await query(
    `DELETE FROM bookmarks
     WHERE user_id=$1 AND diary_id=$2`,
    [req.user.id, req.params.id]
  );

  res.json({ bookmarked: false });
});

app.get("/api/bookmarks", auth, async (req, res) => {
  const result = await query(
    `SELECT
      d.id,d.title,d.body,d.created_at,
      d.is_anonymous,d.mood,d.category,
      CASE
        WHEN d.is_anonymous=1 THEN 'Anonymous'
        ELSE u.name
      END author
     FROM bookmarks b
     JOIN diaries d ON d.id=b.diary_id
     JOIN users u ON u.id=d.user_id
     WHERE b.user_id=$1
       AND d.is_public=1
       AND d.status='published'
     ORDER BY b.created_at DESC`,
    [req.user.id]
  );

  res.json({ diaries: result.rows });
});

app.get("/api/diaries/:id/bookmark", auth, async (req, res) => {
  const result = await query(
    `SELECT 1 FROM bookmarks
     WHERE user_id=$1 AND diary_id=$2`,
    [req.user.id, req.params.id]
  );

  res.json({ bookmarked: !!result.rowCount });
});

app.get("/api/admin/stats", auth, admin, async (req, res) => {
  const result = await query(`
    SELECT
      (SELECT COUNT(*) FROM users)::int users,
      (SELECT COUNT(*) FROM diaries)::int entries,
      (SELECT COUNT(*) FROM diaries WHERE is_anonymous=1)::int anonymous,
      (SELECT COUNT(*) FROM reports WHERE status='open')::int reports,
      (SELECT COUNT(*) FROM diaries
       WHERE is_public=1 AND status='published')::int "publicEntries",
      (SELECT COUNT(*) FROM diaries WHERE mood IS NOT NULL)::int moods,
      (SELECT COUNT(*) FROM prompts WHERE is_active=1)::int prompts
  `);

  res.json({ stats: result.rows[0] });
});

app.get("/api/admin/analytics", auth, admin, async (req, res) => {
  const moods = await query(`
    SELECT COALESCE(mood,'none') mood,
           COUNT(*)::int count
    FROM diaries
    GROUP BY mood
    ORDER BY count DESC
  `);

  const categories = await query(`
    SELECT COALESCE(category,'Uncategorised') category,
           COUNT(*)::int count
    FROM diaries
    GROUP BY category
    ORDER BY count DESC
  `);

const trend = await query(`
    SELECT TO_CHAR(created_at, 'YYYY-MM-DD') AS "day",
           COUNT(*)::int AS count
    FROM diaries
    GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD')
    ORDER BY TO_CHAR(created_at, 'YYYY-MM-DD') DESC
    LIMIT 14
`);
  res.json({
    moods: moods.rows,
    categories: categories.rows,
    trend: trend.rows.reverse()
  });
});

app.get("/api/admin/prompts", auth, admin, async (req, res) => {
  const result = await query(
    `SELECT * FROM prompts ORDER BY id DESC`
  );

  res.json({ prompts: result.rows });
});

app.post("/api/admin/prompts", auth, admin, async (req, res) => {
  const text = String(req.body.text || "").trim();
  const category = String(
    req.body.category || "Reflection"
  ).trim();

  if (!text) {
    return res.status(400).json({
      error: "Prompt text is required."
    });
  }

  try {
    const result = await query(
      `INSERT INTO prompts (text,category)
       VALUES ($1,$2)
       RETURNING *`,
      [text, category]
    );

    res.status(201).json({
      prompt: result.rows[0]
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({
        error: "That prompt already exists."
      });
    }

    throw err;
  }
});

app.patch("/api/admin/prompts/:id", auth, admin, async (req, res) => {
  const active = req.body.is_active ? 1 : 0;

  const result = await query(
    `UPDATE prompts
     SET is_active=$1
     WHERE id=$2
     RETURNING id`,
    [active, req.params.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({
      error: "Prompt not found."
    });
  }

  res.json({ message: "Prompt updated." });
});

app.delete("/api/admin/prompts/:id", auth, admin, async (req, res) => {
  const result = await query(
    `DELETE FROM prompts
     WHERE id=$1
     RETURNING id`,
    [req.params.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({
      error: "Prompt not found."
    });
  }

  res.json({ message: "Prompt deleted." });
});

app.get("/api/admin/users", auth, admin, async (req, res) => {
  const result = await query(`
    SELECT
      u.id,u.name,u.email,u.role,
      u.is_suspended,u.created_at,
      COUNT(d.id)::int entries
    FROM users u
    LEFT JOIN diaries d ON d.user_id=u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `);

  res.json({ users: result.rows });
});

app.patch("/api/admin/users/:id", auth, admin, async (req, res) => {
  const { suspended, role } = req.body;

  const target = await query(
    `SELECT id,role FROM users WHERE id=$1`,
    [req.params.id]
  );

  const user = target.rows[0];

  if (!user) {
    return res.status(404).json({
      error: "User not found."
    });
  }

  if (
    user.id === req.user.id &&
    (suspended || role === "user")
  ) {
    return res.status(400).json({
      error: "You cannot remove your own admin access."
    });
  }

  if (role && !["user", "admin"].includes(role)) {
    return res.status(400).json({
      error: "Invalid role."
    });
  }

  await query(
    `UPDATE users
     SET is_suspended=COALESCE($1,is_suspended),
         role=COALESCE($2,role)
     WHERE id=$3`,
    [
      typeof suspended === "boolean"
        ? suspended ? 1 : 0
        : null,
      role || null,
      req.params.id
    ]
  );

  res.json({ message: "User updated." });
});

app.delete("/api/admin/users/:id", auth, admin, async (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({
      error: "You cannot delete your own account here."
    });
  }

  const result = await query(
    `DELETE FROM users
     WHERE id=$1
     RETURNING id`,
    [req.params.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({
      error: "User not found."
    });
  }

  res.json({ message: "User deleted." });
});

app.get("/api/admin/entries", auth, admin, async (req, res) => {
  const result = await query(`
    SELECT
      d.id,d.title,d.body,d.created_at,
      d.is_public,d.is_anonymous,
      d.status,d.mood,d.category,
      u.name owner,u.email
    FROM diaries d
    JOIN users u ON u.id=d.user_id
    ORDER BY d.created_at DESC
  `);

  res.json({ entries: result.rows });
});

app.delete("/api/admin/entries/:id", auth, admin, async (req, res) => {
  const result = await query(
    `UPDATE diaries
     SET status='removed',is_public=0
     WHERE id=$1
     RETURNING id`,
    [req.params.id]
  );

  if (!result.rowCount) {
    return res.status(404).json({
      error: "Entry not found."
    });
  }

  res.json({
    message: "Entry removed from public view."
  });
});

app.get("/api/admin/reports", auth, admin, async (req, res) => {
  const result = await query(`
    SELECT
      r.*,d.title,d.is_anonymous,
      u.name reporter
    FROM reports r
    JOIN diaries d ON d.id=r.diary_id
    LEFT JOIN users u ON u.id=r.reporter_id
    ORDER BY
      CASE WHEN r.status='open' THEN 0 ELSE 1 END,
      r.created_at DESC
  `);

  res.json({ reports: result.rows });
});

app.patch("/api/admin/reports/:id", auth, admin, async (req, res) => {
  const status = req.body.status;

  if (!["open", "resolved", "dismissed"].includes(status)) {
    return res.status(400).json({
      error: "Invalid report status."
    });
  }

  await query(
    `UPDATE reports
     SET status=$1,
         resolved_at=$2
     WHERE id=$3`,
    [
      status,
      status === "open" ? null : new Date(),
      req.params.id
    ]
  );

  res.json({ message: "Report updated." });
});

app.get("*", (req, res) => {
  res.sendFile(
    path.join(__dirname, "public", "index.html")
  );
});

async function start() {
  try {
    await initDatabase();
    await query("SELECT 1");

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Quiet Pages running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start Quiet Pages:", err);
    process.exit(1);
  }
}

process.on("SIGTERM", async () => {
  await pool.end();
  process.exit(0);
});

start();