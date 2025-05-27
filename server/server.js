require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const { Pool } = require('pg');
const fs = require('fs');

const app = express();
const PORT = process.env.APP_PORT || 3000; // Porta que a aplicação combinada usará

// --- Configurações do Backend ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/';
    if (!fs.existsSync(uploadPath)){
        fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage: storage });

app.set('trust proxy', 1); // Se ainda estiver atrás de um proxy externo (ex: Nginx geral)

const pool = new Pool({
  host: process.env.DB_HOST, // IP da máquina com PostgreSQL
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '5432', 10),
});

pool.on('connect', () => console.log('App Combinada: Conectado ao PostgreSQL!'));
pool.on('error', (err) => console.error('App Combinada: Erro no pool do PostgreSQL', err));

// --- Rotas do Backend ---
// As chamadas do frontend em script.js para '/api/upload' agora serão para '/upload'
// ou você pode manter o prefixo /api/ se preferir, ajustando as rotas aqui.
app.post('/api/upload', upload.single('file'), async (req, res) => { // Mantendo /api/ por consistência com o script.js atual
  if (!req.file) {
    return res.status(400).send('Nenhum arquivo enviado.');
  }
  const file = req.file;
  const clientIp = req.ip;
  let dbClient;
  try {
    dbClient = await pool.connect();
    await dbClient.query('BEGIN');
    await dbClient.query('SET LOCAL app.current_requester_ip = $1', [clientIp]);
    await dbClient.query(
      'INSERT INTO files (filename, originalname, upload_time) VALUES ($1, $2, NOW())',
      [file.filename, file.originalname]
    );
    await dbClient.query('COMMIT');
    res.send(`Upload do arquivo ${file.originalname} concluído com sucesso e auditado.`);
  } catch (error) {
    if (dbClient) {
      try { await dbClient.query('ROLLBACK'); } catch (rbError) { console.error('Erro no rollback:', rbError); }
    }
    console.error('Erro no processo de upload:', error);
    if (file && file.path && fs.existsSync(file.path)) {
        try { await fs.promises.unlink(file.path); } catch (cleanupError) { console.error('Erro ao limpar arquivo:', cleanupError); }
    }
    res.status(500).send('Erro ao salvar ou auditar arquivo.');
  } finally {
    if (dbClient) dbClient.release();
  }
});

// Mantendo /api/ por consistência com o script.js atual
app.get('/api/relatorio-auditoria/arquivos', async (req, res) => {
  let dbClient;
  try {
    dbClient = await pool.connect();
    const { dataInicio, dataFim, operacao_tipo, ip } = req.query;
    let auditQuery = 'SELECT log_id, tabela_modificada, operacao_tipo, dados_antigos, dados_novos, requester_ip, usuario_db, tempo_modificacao FROM auditoria_arquivos_log';
    const conditions = [];
    const queryParams = [];
    let paramIndex = 1;

    if (dataInicio) { conditions.push(`tempo_modificacao >= $${paramIndex++}`); queryParams.push(dataInicio); }
    if (dataFim) { conditions.push(`tempo_modificacao < ($${paramIndex++}::date + interval '1 day')`); queryParams.push(dataFim); }
    if (operacao_tipo) { conditions.push(`operacao_tipo = $${paramIndex++}`); queryParams.push(operacao_tipo.toUpperCase()); }
    if (ip) { conditions.push(`requester_ip = $${paramIndex++}`); queryParams.push(ip); }

    if (conditions.length > 0) auditQuery += ' WHERE ' + conditions.join(' AND ');
    auditQuery += ' ORDER BY tempo_modificacao DESC';

    const { rows } = await dbClient.query(auditQuery, queryParams);
    res.json(rows);
  } catch (error) {
    console.error('Erro ao gerar relatório de auditoria:', error);
    res.status(500).send('Erro ao gerar relatório de auditoria.');
  } finally {
    if (dbClient) dbClient.release();
  }
});

// --- Servir Arquivos Estáticos do Frontend ---
app.use(express.static(path.join(__dirname, 'public')));

// Rota catch-all para o frontend (especialmente se for uma SPA)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api/')) { // Não interfere com as rotas de API
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.status(404).send('API endpoint not found');
  }
});

app.listen(PORT, async () => {
  console.log(`Aplicação combinada (Frontend + Backend) rodando na porta ${PORT}`);
  // Teste de conexão inicial
  let client;
  try {
    client = await pool.connect();
    console.log('App Combinada: Conexão de teste com o banco de dados bem-sucedida.');
  } catch (err) {
    console.error('App Combinada: Falha na conexão de teste com o banco de dados:', err.stack);
  } finally {
    if (client) client.release();
  }
});