-- ==============================================================================
-- SHINKŌ SYSTEMS — SCHEMA CANÔNICO RELACIONAL: VITACARE ALL-IN-ONE
-- ==============================================================================
-- Banco: PostgreSQL 16 Alpine (Container: vitacare-postgres na VPS 179.198.125.140)
-- Host: /opt/vitacare/infra/init-schema-vitacare.sql
-- Módulos: Módulo 1 (Central Atendimento 9 usuários + Kanban) & Módulo 4 (IA Vencimentos)
-- ==============================================================================

-- Habilita extensão para geração de UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. TABELA: empresas_clientes (Empresas Conveniadas à VitaCare)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS empresas_clientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    razao_social VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    cnpj VARCHAR(18) UNIQUE NOT NULL,
    telefone_whatsapp VARCHAR(30),
    email_contato VARCHAR(255),
    responsavel_rh VARCHAR(150),
    grau_risco INTEGER CHECK (grau_risco BETWEEN 1 AND 4) DEFAULT 1,
    status VARCHAR(30) DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo', 'pendente', 'bloqueado')),
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_empresas_cnpj ON empresas_clientes(cnpj);
CREATE INDEX IF NOT EXISTS idx_empresas_status ON empresas_clientes(status);

-- ------------------------------------------------------------------------------
-- 2. TABELA: operadores (Os 9 Colaboradores da VitaCare / GM SST)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS operadores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(150) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    setor_padrao VARCHAR(30) NOT NULL CHECK (setor_padrao IN ('comercial', 'agendamento', 'tecnico', 'gestao')),
    role VARCHAR(30) NOT NULL DEFAULT 'operador' CHECK (role IN ('admin', 'supervisor', 'operador')),
    whatsapp VARCHAR(30),
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operadores_setor ON operadores(setor_padrao);
CREATE INDEX IF NOT EXISTS idx_operadores_email ON operadores(email);

-- ------------------------------------------------------------------------------
-- 3. TABELA: conversas_whatsapp (Sessões Multiatendente via WAHA :3011)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversas_whatsapp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id VARCHAR(50) NOT NULL, -- Ex: 5531999999999@c.us
    nome_contato VARCHAR(150),
    empresa_id UUID REFERENCES empresas_clientes(id) ON DELETE SET NULL,
    
    -- Portas independentes (As 3 Linhas da Clínica)
    sessao_waha VARCHAR(50) NOT NULL CHECK (sessao_waha IN ('sessao_comercial', 'sessao_agendamento', 'sessao_tecnico')),
    numero_destino VARCHAR(30) NOT NULL, -- O número da clínica que recebeu a mensagem
    
    -- Roteamento de fila e atendente
    setor_atual VARCHAR(30) NOT NULL CHECK (setor_atual IN ('comercial', 'agendamento', 'tecnico')),
    atendente_id UUID REFERENCES operadores(id) ON DELETE SET NULL,
    status_atendimento VARCHAR(30) DEFAULT 'triagem' CHECK (status_atendimento IN ('triagem', 'em_atendimento', 'aguardando', 'encerrado')),
    
    ultima_mensagem_preview TEXT,
    ultima_mensagem_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversas_chat_sessao ON conversas_whatsapp(chat_id, sessao_waha);
CREATE INDEX IF NOT EXISTS idx_conversas_setor ON conversas_whatsapp(setor_atual);
CREATE INDEX IF NOT EXISTS idx_conversas_status ON conversas_whatsapp(status_atendimento);

-- ------------------------------------------------------------------------------
-- 4. TABELA: mensagens (Histórico de Atendimento WhatsApp)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mensagens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversa_id UUID NOT NULL REFERENCES conversas_whatsapp(id) ON DELETE CASCADE,
    direcao VARCHAR(10) NOT NULL CHECK (direcao IN ('inbound', 'outbound')), -- inbound = recebida, outbound = enviada
    operador_id UUID REFERENCES operadores(id) ON DELETE SET NULL, -- preenchido quando enviado pela equipe
    tipo VARCHAR(20) DEFAULT 'texto' CHECK (tipo IN ('texto', 'audio', 'imagem', 'documento', 'localizacao')),
    conteudo TEXT NOT NULL,
    midia_url TEXT,
    waha_message_id VARCHAR(100),
    lida BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mensagens_conversa ON mensagens(conversa_id);
CREATE INDEX IF NOT EXISTS idx_mensagens_created_at ON mensagens(created_at);

-- ------------------------------------------------------------------------------
-- 5. TABELA: demandas_kanban (Ordens de Serviço e Tarefas — Adeus Trello!)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS demandas_kanban (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT,
    empresa_id UUID REFERENCES empresas_clientes(id) ON DELETE SET NULL,
    conversa_origem_id UUID REFERENCES conversas_whatsapp(id) ON DELETE SET NULL,
    
    origem VARCHAR(30) DEFAULT 'whatsapp' CHECK (origem IN ('whatsapp', 'email_outlook', 'manual')),
    tipo_demanda VARCHAR(50) DEFAULT 'atendimento_geral' CHECK (tipo_demanda IN ('atendimento_geral', 'agendamento_aso', 'renovacao_pgr', 'duvida_esocial', 'conector_outlook')),
    setor VARCHAR(30) NOT NULL CHECK (setor IN ('comercial', 'agendamento', 'tecnico')),
    
    -- Colunas do Kanban
    status VARCHAR(30) DEFAULT 'triagem' CHECK (status IN ('triagem', 'em_andamento', 'aguardando_cliente', 'concluido', 'cancelado')),
    prioridade VARCHAR(20) DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'urgente')),
    
    responsavel_id UUID REFERENCES operadores(id) ON DELETE SET NULL,
    solicitante_nome VARCHAR(150),
    solicitante_contato VARCHAR(50),
    
    sla_limite TIMESTAMP WITH TIME ZONE,
    concluido_em TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_demandas_status ON demandas_kanban(status);
CREATE INDEX IF NOT EXISTS idx_demandas_setor ON demandas_kanban(setor);
CREATE INDEX IF NOT EXISTS idx_demandas_responsavel ON demandas_kanban(responsavel_id);

-- ------------------------------------------------------------------------------
-- 6. TABELA: vencimentos_documentos (Motor de IA de Vencimentos — Módulo 4)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vencimentos_documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    empresa_id UUID NOT NULL REFERENCES empresas_clientes(id) ON DELETE CASCADE,
    tipo_documento VARCHAR(50) NOT NULL CHECK (tipo_documento IN ('PGR', 'PCMSO', 'LTCAT', 'LTI', 'APR')),
    numero_laudo VARCHAR(100),
    data_emissao DATE NOT NULL,
    data_vencimento DATE NOT NULL,
    
    -- Status monitorado pelo Agente de IA
    status_alerta VARCHAR(30) DEFAULT 'normal' CHECK (status_alerta IN ('normal', 'alerta_60d', 'alerta_30d', 'alerta_15d', 'vencido', 'renovado')),
    
    ultimo_disparo_whatsapp TIMESTAMP WITH TIME ZONE,
    total_alertas_enviados INTEGER DEFAULT 0,
    observacoes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_vencimentos_data ON vencimentos_documentos(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_vencimentos_alerta ON vencimentos_documentos(status_alerta);

-- ==============================================================================
-- SEED INICIAL: Os 9 Operadores da Equipe VitaCare / GM SST
-- ==============================================================================
INSERT INTO operadores (nome, email, senha_hash, setor_padrao, role)
VALUES
    ('Leonardo Matos', 'leonardo@vitacareocupacional.com.br', crypt('VitaCare2026!', gen_salt('bf')), 'gestao', 'admin'),
    ('Noelia Gigli', 'noelia@vitacareocupacional.com.br', crypt('VitaCare2026!', gen_salt('bf')), 'gestao', 'admin'),
    ('Operador Comercial 01', 'comercial1@vitacareocupacional.com.br', crypt('VitaCare2026!', gen_salt('bf')), 'comercial', 'operador'),
    ('Operador Comercial 02', 'comercial2@vitacareocupacional.com.br', crypt('VitaCare2026!', gen_salt('bf')), 'comercial', 'operador'),
    ('Operador Agendamento 01', 'agendamento1@vitacareocupacional.com.br', crypt('VitaCare2026!', gen_salt('bf')), 'agendamento', 'operador'),
    ('Operador Agendamento 02', 'agendamento2@vitacareocupacional.com.br', crypt('VitaCare2026!', gen_salt('bf')), 'agendamento', 'operador'),
    ('Operador Agendamento 03', 'agendamento3@vitacareocupacional.com.br', crypt('VitaCare2026!', gen_salt('bf')), 'agendamento', 'operador'),
    ('Operador Técnico SST 01', 'tecnico1@vitacareocupacional.com.br', crypt('VitaCare2026!', gen_salt('bf')), 'tecnico', 'operador'),
    ('Operador Técnico SST 02', 'tecnico2@vitacareocupacional.com.br', crypt('VitaCare2026!', gen_salt('bf')), 'tecnico', 'operador')
ON CONFLICT (email) DO NOTHING;
