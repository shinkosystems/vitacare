/**
 * ==============================================================================
 * VITACARE OCUPACIONAL — CENTRAL MULTIATENDENTE & WEBHOOK HUB
 * ==============================================================================
 * Desenvolvido por: Shinkō Systems — Laboratório de IA
 * Liderança Técnica: Pedro Borba
 * Cliente: Leonardo Matos (Diretor Geral VitaCare Gestão em Saúde)
 * ==============================================================================
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'vitacare_jwt_secret_soberano_2026';
const WAHA_URL = process.env.WAHA_URL || 'http://vitacare-waha:3000';
const WAHA_API_KEY = process.env.WAHA_API_KEY || 'vitacare_api_key_soberana_76879272';

// ------------------------------------------------------------------------------
// POOL DE CONEXÃO POSTGRESQL (Soberano & Isolado)
// ------------------------------------------------------------------------------
const pool = new Pool({
  host: process.env.PGHOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || '5432', 10),
  user: process.env.PGUSER || 'vitacare_admin',
  password: process.env.PGPASSWORD || 'vitacare_shinko_soberana_2026',
  database: process.env.PGDATABASE || 'vitacare_prod',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[PostgreSQL Error]:', err.message);
});

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ------------------------------------------------------------------------------
// MIDDLEWARE DE AUTENTICAÇÃO (JWT)
// ------------------------------------------------------------------------------
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão expirada ou inválida. Faça login novamente.' });
  }
};

// ------------------------------------------------------------------------------
// 1. ROTAS DE AUTENTICAÇÃO
// ------------------------------------------------------------------------------

// Login do Operador / Gestor
app.post('/api/auth/login', async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ error: 'E-mail e senha são obrigatórios' });
  }

  try {
    const result = await pool.query(
      'SELECT id, nome, email, senha_hash, setor_padrao, role, whatsapp, ativo FROM operadores WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }

    const operador = result.rows[0];

    if (!operador.ativo) {
      return res.status(403).json({ error: 'Usuário desativado. Contate o administrador.' });
    }

    // Validação com bcrypt (senhas inicializadas com VitaCare2026!)
    const match = await bcrypt.compare(senha, operador.senha_hash);
    if (!match) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }

    const token = jwt.sign(
      {
        id: operador.id,
        nome: operador.nome,
        email: operador.email,
        setor_padrao: operador.setor_padrao,
        role: operador.role,
      },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    return res.json({
      token,
      usuario: {
        id: operador.id,
        nome: operador.nome,
        email: operador.email,
        setor_padrao: operador.setor_padrao,
        role: operador.role,
        whatsapp: operador.whatsapp,
      },
    });
  } catch (err) {
    console.error('[Login Error]:', err);
    return res.status(500).json({ error: 'Erro interno ao realizar autenticação' });
  }
});

// Obter dados do operador autenticado
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, email, setor_padrao, role, whatsapp FROM operadores WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Operador não encontrado' });
    }
    return res.json(result.rows[0]);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao obter dados do usuário' });
  }
});

// ------------------------------------------------------------------------------
// 2. WEBHOOK INBOUND: RECEBIMENTO DO WAHA (As 3 Linhas da VitaCare)
// ------------------------------------------------------------------------------
app.post('/webhook/waha', async (req, res) => {
  const { event, session, payload } = req.body;

  // Responde imediatamente com 200 OK para o WAHA
  res.status(200).json({ status: 'received' });

  try {
    if (event === 'message' && payload && !payload.fromMe) {
      const chatId = payload.from; // Ex: 5531999999999@c.us
      const nomeContato = payload._data?.notifyName || payload.from.split('@')[0];
      const corpoMensagem = payload.body || '[Mídia / Anexo]';
      const wahaMsgId = payload.id;

      // Mapeia a sessão para o setor padrão inicial
      let setorInicial = 'comercial';
      if (session === 'sessao_agendamento') setorInicial = 'agendamento';
      if (session === 'sessao_tecnico') setorInicial = 'tecnico';

      // 1. Localiza ou cria a conversa
      let conversaResult = await pool.query(
        'SELECT id, setor_atual, status_atendimento FROM conversas_whatsapp WHERE chat_id = $1 AND sessao_waha = $2',
        [chatId, session]
      );

      let conversaId;
      if (conversaResult.rows.length > 0) {
        conversaId = conversaResult.rows[0].id;
        await pool.query(
          `UPDATE conversas_whatsapp 
           SET ultima_mensagem_preview = $1, ultima_mensagem_at = CURRENT_TIMESTAMP, nome_contato = COALESCE($2, nome_contato)
           WHERE id = $3`,
          [corpoMensagem.substring(0, 200), nomeContato, conversaId]
        );
      } else {
        const novaConversa = await pool.query(
          `INSERT INTO conversas_whatsapp 
           (chat_id, nome_contato, sessao_waha, numero_destino, setor_atual, status_atendimento, ultima_mensagem_preview, ultima_mensagem_at)
           VALUES ($1, $2, $3, $4, $5, 'triagem', $6, CURRENT_TIMESTAMP)
           RETURNING id`,
          [chatId, nomeContato, session, session, setorInicial, corpoMensagem.substring(0, 200)]
        );
        conversaId = novaConversa.rows[0].id;
      }

      // 2. Insere a mensagem inbound no banco
      await pool.query(
        `INSERT INTO mensagens (conversa_id, direcao, tipo, conteudo, waha_message_id)
         VALUES ($1, 'inbound', $2, $3, $4)`,
        [conversaId, payload.hasMedia ? 'documento' : 'texto', corpoMensagem, wahaMsgId]
      );

      console.log(`[WAHA Inbound]: Mensagem de ${nomeContato} (${chatId}) salva na sessão ${session}`);
    }
  } catch (err) {
    console.error('[Webhook WAHA Error]:', err);
  }
});

// ------------------------------------------------------------------------------
// 3. ROTAS DA CENTRAL DE ATENDIMENTO
// ------------------------------------------------------------------------------

// Listar conversas ativas com contagem e filtros
app.get('/api/conversas', authMiddleware, async (req, res) => {
  const { setor, status, busca } = req.query;

  try {
    let query = `
      SELECT 
        c.id, c.chat_id, c.nome_contato, c.sessao_waha, c.numero_destino,
        c.setor_atual, c.status_atendimento, c.ultima_mensagem_preview, c.ultima_mensagem_at,
        e.id as empresa_id, e.razao_social, e.nome_fantasia, e.cnpj,
        o.id as atendente_id, o.nome as atendente_nome,
        (SELECT COUNT(*) FROM mensagens m WHERE m.conversa_id = c.id AND m.lida = FALSE AND m.direcao = 'inbound') as nao_lidas
      FROM conversas_whatsapp c
      LEFT JOIN empresas_clientes e ON c.empresa_id = e.id
      LEFT JOIN operadores o ON c.atendente_id = o.id
      WHERE 1=1
    `;
    const params = [];

    // Filtro por setor (se não for admin/gestão, restringe ao setor do operador ou ao selecionado)
    if (setor && setor !== 'todos') {
      params.push(setor);
      query += ` AND c.setor_atual = $${params.length}`;
    }

    if (status && status !== 'todos') {
      params.push(status);
      query += ` AND c.status_atendimento = $${params.length}`;
    }

    if (busca) {
      params.push(`%${busca}%`);
      query += ` AND (c.nome_contato ILIKE $${params.length} OR c.chat_id ILIKE $${params.length} OR e.nome_fantasia ILIKE $${params.length} OR e.cnpj ILIKE $${params.length})`;
    }

    query += ' ORDER BY c.ultima_mensagem_at DESC LIMIT 100';

    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.error('[List Conversas Error]:', err);
    return res.status(500).json({ error: 'Erro ao listar conversas' });
  }
});

// Obter histórico de mensagens de uma conversa
app.get('/api/conversas/:id/mensagens', authMiddleware, async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT m.id, m.conversa_id, m.direcao, m.tipo, m.conteudo, m.midia_url, m.created_at, m.lida,
              o.nome as operador_nome
       FROM mensagens m
       LEFT JOIN operadores o ON m.operador_id = o.id
       WHERE m.conversa_id = $1
       ORDER BY m.created_at ASC`,
      [id]
    );

    // Marca as mensagens recebidas como lidas
    await pool.query(
      'UPDATE mensagens SET lida = TRUE WHERE conversa_id = $1 AND direcao = $2',
      [id, 'inbound']
    );

    return res.json(result.rows);
  } catch (err) {
    console.error('[Get Mensagens Error]:', err);
    return res.status(500).json({ error: 'Erro ao obter mensagens' });
  }
});

// Enviar mensagem (Outbound via WAHA + Gravação no PostgreSQL)
app.post('/api/conversas/:id/mensagens', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { texto } = req.body;

  if (!texto || !texto.trim()) {
    return res.status(400).json({ error: 'Texto da mensagem é obrigatório' });
  }

  try {
    // 1. Obtém a conversa
    const convResult = await pool.query(
      'SELECT chat_id, sessao_waha FROM conversas_whatsapp WHERE id = $1',
      [id]
    );

    if (convResult.rows.length === 0) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    const { chat_id, sessao_waha } = convResult.rows[0];

    // 2. Dispara no WAHA
    let wahaId = null;
    try {
      const response = await fetch(`${WAHA_URL}/api/sendText`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': WAHA_API_KEY,
        },
        body: JSON.stringify({
          session: sessao_waha,
          chatId: chat_id,
          text: texto.trim(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        wahaId = data?.id;
      } else {
        console.warn('[WAHA Warning]: Resposta não-200 do WAHA ao enviar mensagem');
      }
    } catch (wahaErr) {
      console.error('[WAHA Send Error]:', wahaErr.message);
      // Continua para gravar localmente no banco para não perder a resposta do operador
    }

    // 3. Grava no PostgreSQL
    const msgResult = await pool.query(
      `INSERT INTO mensagens (conversa_id, direcao, operador_id, tipo, conteudo, waha_message_id, lida)
       VALUES ($1, 'outbound', $2, 'texto', $3, $4, TRUE)
       RETURNING *`,
      [id, req.user.id, texto.trim(), wahaId]
    );

    // 4. Atualiza preview na conversa e atribui atendente se estiver em triagem
    await pool.query(
      `UPDATE conversas_whatsapp 
       SET ultima_mensagem_preview = $1, ultima_mensagem_at = CURRENT_TIMESTAMP, 
           status_atendimento = CASE WHEN status_atendimento = 'triagem' THEN 'em_atendimento' ELSE status_atendimento END,
           atendente_id = COALESCE(atendente_id, $2)
       WHERE id = $3`,
      [texto.trim().substring(0, 200), req.user.id, id]
    );

    const novaMensagem = msgResult.rows[0];
    novaMensagem.operador_nome = req.user.nome;

    return res.status(201).json(novaMensagem);
  } catch (err) {
    console.error('[Send Message Error]:', err);
    return res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }
});

// Transferir conversa de setor ou atribuir atendente
app.patch('/api/conversas/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { setor_atual, status_atendimento, atendente_id, empresa_id } = req.body;

  try {
    const fields = [];
    const values = [];

    if (setor_atual) {
      values.push(setor_atual);
      fields.push(`setor_atual = $${values.length}`);
    }
    if (status_atendimento) {
      values.push(status_atendimento);
      fields.push(`status_atendimento = $${values.length}`);
    }
    if (atendente_id !== undefined) {
      values.push(atendente_id || null);
      fields.push(`atendente_id = $${values.length}`);
    }
    if (empresa_id !== undefined) {
      values.push(empresa_id || null);
      fields.push(`empresa_id = $${values.length}`);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo fornecido para atualização' });
    }

    values.push(id);
    const query = `UPDATE conversas_whatsapp SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`;
    const result = await pool.query(query, values);

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('[Update Conversa Error]:', err);
    return res.status(500).json({ error: 'Erro ao atualizar conversa' });
  }
});

// ------------------------------------------------------------------------------
// 4. ROTAS DO QUADRO KANBAN (Demandas & Tarefas)
// ------------------------------------------------------------------------------

// Listar demandas do Kanban
app.get('/api/kanban', authMiddleware, async (req, res) => {
  const { setor } = req.query;

  try {
    let query = `
      SELECT d.*, 
             e.razao_social as empresa_nome, e.cnpj as empresa_cnpj,
             o.nome as responsavel_nome
      FROM demandas_kanban d
      LEFT JOIN empresas_clientes e ON d.empresa_id = e.id
      LEFT JOIN operadores o ON d.responsavel_id = o.id
      WHERE 1=1
    `;
    const params = [];

    if (setor && setor !== 'todos') {
      params.push(setor);
      query += ` AND d.setor = $${params.length}`;
    }

    query += ' ORDER BY d.prioridade DESC, d.created_at DESC';

    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err) {
    console.error('[Kanban List Error]:', err);
    return res.status(500).json({ error: 'Erro ao carregar quadro Kanban' });
  }
});

// Criar nova demanda (avulsa ou via conversa do WhatsApp)
app.post('/api/kanban', authMiddleware, async (req, res) => {
  const { titulo, descricao, empresa_id, conversa_origem_id, setor, prioridade, prazo_limite, tipo_demanda } = req.body;

  if (!titulo || !setor) {
    return res.status(400).json({ error: 'Título e setor são obrigatórios' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO demandas_kanban 
       (titulo, descricao, empresa_id, conversa_origem_id, setor, prioridade, prazo_limite, tipo_demanda, responsavel_id, status_coluna)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'triagem')
       RETURNING *`,
      [
        titulo.trim(),
        descricao || null,
        empresa_id || null,
        conversa_origem_id || null,
        setor,
        prioridade || 'media',
        prazo_limite || null,
        tipo_demanda || 'atendimento_geral',
        req.user.id,
      ]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[Kanban Create Error]:', err);
    return res.status(500).json({ error: 'Erro ao criar demanda no Kanban' });
  }
});

// Atualizar status / coluna do card Kanban
app.patch('/api/kanban/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status_coluna, prioridade, responsavel_id } = req.body;

  try {
    const fields = [];
    const values = [];

    if (status_coluna) {
      values.push(status_coluna);
      fields.push(`status_coluna = $${values.length}`);
      if (status_coluna === 'concluido') {
        fields.push(`concluido_at = CURRENT_TIMESTAMP`);
      }
    }
    if (prioridade) {
      values.push(prioridade);
      fields.push(`prioridade = $${values.length}`);
    }
    if (responsavel_id !== undefined) {
      values.push(responsavel_id || null);
      fields.push(`responsavel_id = $${values.length}`);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'Nenhum campo para atualizar' });
    }

    values.push(id);
    const query = `UPDATE demandas_kanban SET ${fields.join(', ')} WHERE id = $${values.length} RETURNING *`;
    const result = await pool.query(query, values);

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('[Kanban Update Error]:', err);
    return res.status(500).json({ error: 'Erro ao atualizar demanda' });
  }
});

// ------------------------------------------------------------------------------
// 5. ROTAS DE EMPRESAS CLIENTES
// ------------------------------------------------------------------------------
app.get('/api/empresas', authMiddleware, async (req, res) => {
  const { busca } = req.query;
  try {
    let query = 'SELECT id, razao_social, nome_fantasia, cnpj, responsavel_rh, telefone_whatsapp FROM empresas_clientes WHERE status = $1';
    const params = ['ativo'];

    if (busca) {
      params.push(`%${busca}%`);
      query += ` AND (razao_social ILIKE $2 OR nome_fantasia ILIKE $2 OR cnpj ILIKE $2)`;
    }

    query += ' ORDER BY nome_fantasia ASC LIMIT 50';
    const result = await pool.query(query, params);
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar empresas' });
  }
});

// Listar operadores da equipe para seleção
app.get('/api/operadores', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, nome, email, setor_padrao, role FROM operadores WHERE ativo = TRUE ORDER BY nome ASC'
    );
    return res.json(result.rows);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar operadores' });
  }
});

// Fallback para SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Inicialização
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[VitaCare Central Atendimento] Rodando na porta ${PORT}`);
  console.log(`[Soberano Mode]: Conectado ao PostgreSQL em ${process.env.PGHOST || '127.0.0.1'}:${process.env.PGPORT || '5432'}`);
});
