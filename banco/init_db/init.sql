-- Tabela principal para os arquivos
CREATE TABLE IF NOT EXISTS files (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL,
    originalname TEXT NOT NULL,
    upload_time TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Tabela para logs de auditoria da tabela 'files'
CREATE TABLE IF NOT EXISTS auditoria_arquivos_log (
    log_id SERIAL PRIMARY KEY,
    tabela_modificada VARCHAR(255) NOT NULL,
    operacao_tipo VARCHAR(10) NOT NULL, -- INSERT, UPDATE, DELETE
    dados_antigos JSONB,
    dados_novos JSONB,
    requester_ip VARCHAR(45), -- IP da máquina que fez a requisição
    usuario_db VARCHAR(255),
    tempo_modificacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Função de gatilho para auditoria
CREATE OR REPLACE FUNCTION fn_auditar_arquivos()
RETURNS TRIGGER AS $$
DECLARE
    v_requester_ip VARCHAR(45);
BEGIN
    BEGIN
        v_requester_ip := current_setting('app.current_requester_ip', true); 
        IF v_requester_ip = '' THEN
            v_requester_ip := NULL; -- Trata string vazia como NULL
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_requester_ip := NULL; -- Ou 'UNKNOWN' se preferir
    END;

    IF (TG_OP = 'INSERT') THEN
        INSERT INTO auditoria_arquivos_log (tabela_modificada, operacao_tipo, dados_novos, requester_ip, usuario_db)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(NEW)::jsonb, v_requester_ip, session_user);
        RETURN NEW;
    ELSIF (TG_OP = 'UPDATE') THEN
        INSERT INTO auditoria_arquivos_log (tabela_modificada, operacao_tipo, dados_antigos, dados_novos, requester_ip, usuario_db)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD)::jsonb, row_to_json(NEW)::jsonb, v_requester_ip, session_user);
        RETURN NEW;
    ELSIF (TG_OP = 'DELETE') THEN
        INSERT INTO auditoria_arquivos_log (tabela_modificada, operacao_tipo, dados_antigos, requester_ip, usuario_db)
        VALUES (TG_TABLE_NAME, TG_OP, row_to_json(OLD)::jsonb, v_requester_ip, session_user);
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;


DROP TRIGGER IF EXISTS trg_auditar_arquivos_modificacoes ON files;

-- Cria o gatilho na tabela 'files'
CREATE TRIGGER trg_auditar_arquivos_modificacoes
AFTER INSERT OR UPDATE OR DELETE ON files
FOR EACH ROW EXECUTE FUNCTION fn_auditar_arquivos();