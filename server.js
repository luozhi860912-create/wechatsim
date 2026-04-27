const express = require('express');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3777;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

// Ensure directories
[DATA_DIR, UPLOAD_DIR, path.join(__dirname, 'public')].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

// Simple file-based DB
const DB_FILE = path.join(DATA_DIR, 'db.json');
let db = { users: {}, userData: {} };
if (fs.existsSync(DB_FILE)) {
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) { console.error('DB load error:', e); }
}
function saveDB() {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db), 'utf8'); } catch(e) { console.error('DB save error:', e); }
}

// Token store
const tokens = {};

function authMiddleware(req, res, next) {
  const token = req.headers['x-token'] || req.query.token;
  if (!token || !tokens[token]) return res.status(401).json({ error: 'Unauthorized' });
  req.userId = tokens[token].userId;
  req.username = tokens[token].username;
  next();
}

// Upload config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, uuidv4() + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ===== AUTH ROUTES =====
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: '用户名和密码必填' });
  if (username.length < 2 || password.length < 4) return res.status(400).json({ error: '用户名至少2位，密码至少4位' });
  
  const userCount = Object.keys(db.users).length;
  if (userCount >= 5) return res.status(403).json({ error: '已达到最大用户数限制' });
  
  if (db.users[username]) return res.status(409).json({ error: '用户名已存在' });
  
  const hash = bcrypt.hashSync(password, 10);
  const userId = uuidv4();
  db.users[username] = { userId, hash, created: Date.now() };
  db.userData[userId] = {};
  saveDB();
  
  const token = uuidv4();
  tokens[token] = { userId, username, ts: Date.now() };
  res.json({ ok: true, token, userId });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.users[username];
  if (!user || !bcrypt.compareSync(password, user.hash)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const token = uuidv4();
  tokens[token] = { userId: user.userId, username, ts: Date.now() };
  res.json({ ok: true, token, userId: user.userId });
});

app.get('/api/check', authMiddleware, (req, res) => {
  res.json({ ok: true, userId: req.userId, username: req.username });
});

app.post('/api/logout', authMiddleware, (req, res) => {
  const token = req.headers['x-token'];
  delete tokens[token];
  res.json({ ok: true });
});

// ===== DATA ROUTES =====
app.get('/api/data', authMiddleware, (req, res) => {
  res.json(db.userData[req.userId] || {});
});

app.post('/api/data', authMiddleware, (req, res) => {
  db.userData[req.userId] = req.body;
  saveDB();
  res.json({ ok: true });
});

app.get('/api/data/:key', authMiddleware, (req, res) => {
  const data = db.userData[req.userId] || {};
  res.json({ value: data[req.params.key] });
});

app.post('/api/data/:key', authMiddleware, (req, res) => {
  if (!db.userData[req.userId]) db.userData[req.userId] = {};
  db.userData[req.userId][req.params.key] = req.body.value;
  saveDB();
  res.json({ ok: true });
});

// ===== UPLOAD =====
app.post('/api/upload', authMiddleware, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '没有文件' });
  
  let finalPath = req.file.path;
  let finalName = req.file.filename;
  
  // Try to compress images
  if (/\.(jpg|jpeg|png|webp)$/i.test(req.file.originalname)) {
    try {
      const sharp = require('sharp');
      const compressedName = 'c_' + finalName;
      const compressedPath = path.join(UPLOAD_DIR, compressedName);
      await sharp(finalPath)
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(compressedPath);
      fs.unlinkSync(finalPath);
      finalName = compressedName;
      finalPath = compressedPath;
    } catch(e) {
      // sharp not available or error, use original
    }
  }
  
  const url = `/uploads/${finalName}`;
  res.json({ ok: true, url });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n✅ WeChatSim v5.0 running at http://0.0.0.0:${PORT}\n`);
});
