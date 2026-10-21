# VitaCare Ocupacional — Nuvem Soberana & Central Integrada

> **Desenvolvimento & Arquitetura:** Shinkō Systems — Laboratório de IA  
> **Liderança Shinkō:** Pedro Borba  
> **Liderança Cliente:** Leonardo Matos (Diretor Geral da VitaCare Gestão em Saúde)  
> **Host Oficial:** VPS Soberana Dedicada (`179.198.125.140`)  
> **Diretório VPS:** `/opt/vitacare`

---

## 1. Visão Geral do Projeto

A plataforma **VitaCare All-in-One** é um ecossistema corporativo completo de Medicina e Segurança do Trabalho (SST), desenvolvido sob os princípios da **Nuvem Soberana (Isolamento LGPD Art. 11)**.

### Módulos Contratados (Fase 01):
1. **Módulo 1 • Central Multiatendente WhatsApp (9 Usuários Simultâneos):**
   * Unificação das 3 frentes de comunicação da clínica: `Comercial`, `Agendamento de Exames` e `Técnico SST`.
   * Atendimento colaborativo em tempo real com triagem setorial e histórico por CNPJ.
   * Quadro Operacional de Demandas (Kanban) com criação rápida de chamados.
   * Conector de E-mail/Agenda (Microsoft Outlook/Exchange).
2. **Módulo 4 • Agente de IA de Vencimentos & CRM Proativo:**
   * Motor automatizado de monitoramento das datas de validade de Programas (PGR/PCMSO) e Exames Periódicos (NR-07).
   * Notificações proativas no WhatsApp dos RHs das empresas conveniadas com 60, 30 e 15 dias de antecedência.

---

## 2. Arquitetura da Infraestrutura Soberana

Toda a infraestrutura pesada roda isolada na VPS Linux (`179.198.125.140`), preservando a política de Thin Client (Mac Limpo):

| Serviço | Porta | Descrição |
|---|---|---|
| **PostgreSQL 16 Alpine** | `5432` *(interna)* | Banco relacional dedicado com 6 tabelas canônicas e 9 operadores. |
| **WAHA Core Gateway** | `3011` | Gateway de WhatsApp com 3 sessões setoriais ativas. |
| **Adminer / Studio** | `3012` | Painel visual de gerenciamento de dados e tabelas. |
| **Backup Soberano** | *Daemon interno* | Rotina diária às 03:00 UTC com criptografia AES-256. |

---

## 3. Estrutura do Repositório

```text
├── database/
│   └── schema.sql             # Modelagem relacional DDL e seeds iniciais
├── docs/
│   └── logo-vitacare.png      # Identidade visual oficial da VitaCare
├── infra/
│   ├── docker-compose.yml     # Orquestração dos contêineres na VPS
│   ├── backup-soberano.sh     # Script cron de backup diário AES-256
│   ├── deploy-vitacare-vps.sh # Automação de deploy e subida de serviços
│   └── .env.example           # Variáveis de ambiente e portas homologadas
├── app/                       # Código-fonte da Central Multiatendente e Webhook
├── .gitignore
└── README.md
```

---

## 4. Governança e Segurança

* **LGPD de Saúde (Art. 11):** Os dados clínicos e cadastrais operam em banco dedicado sem compartilhamento com outros clientes.
* **Segurança de Acesso:** Senhas de operadores criptografadas com Bcrypt (`Blowfish`).
* **Sessões Isoladas:** O motor de WhatsApp opera com isolamento de sessão para prevenir conflitos e bloqueios.

---

*Shinkō Systems — Laboratório de IA*
