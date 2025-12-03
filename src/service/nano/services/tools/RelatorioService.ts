import { NanoService } from '../../NanoService';
import { NanoEvents } from '../../events';
import prisma from '@/database';
import fs from 'fs';
import path from 'path';

export class RelatorioService extends NanoService {
    constructor() {
        super('RelatorioService');
    }

    initialize(): void {
        this.listen(NanoEvents.COMMAND_RECEIVED, async (payload) => {
            if (payload.command === 'relatorio_gerar') {
                await this.gerarRelatorio(payload);
            }
        });
    }

    private async gerarRelatorio(payload: any) {
        const { id, projectId } = payload;
        this.log(`Gerando relatório para o projeto ${projectId}`);

        try {
            const projeto = await prisma.projeto.findUnique({
                where: { id: Number(projectId) },
                include: {
                    dominios: { include: { ips: true } },
                    ips: { include: { portas: true } },
                    takedowns: true,
                }
            });

            if (!projeto) throw new Error('Projeto não encontrado.');

            const defaces = await prisma.deface.findMany({ where: { dominio: { projetoId: projeto.id } }, include: { dominio: true } });
            const phishings = await prisma.phishing.findMany({ where: { dominio: { projetoId: projeto.id } }, include: { dominio: true } });
            const whatwebs = await prisma.whatwebResultado.findMany({
                where: { OR: [{ dominio: { projetoId: projeto.id } }, { ip: { projetoId: projeto.id } }] },
                include: { dominio: true, ip: true }
            });
            const diretorios = await prisma.diretorio.findMany({
                where: { OR: [{ dominio: { projetoId: projeto.id } }, { ip: { projetoId: projeto.id } }] },
                include: { dominio: true, ip: true }
            });
            const vazamentos = await prisma.fonteVazamento.findMany({ where: { projetoId: projeto.id } });

            const caminhoTemplate = path.join(process.cwd(), 'public', 'templates', 'relatorio_padrao.md');
            let conteudo = fs.readFileSync(caminhoTemplate, 'utf-8');

            const stats = `
- **Domínios:** ${projeto.dominios.length}
- **IPs:** ${projeto.ips.length}
- **Defacements:** ${defaces.length}
- **Phishing:** ${phishings.length}
- **Takedowns:** ${projeto.takedowns.length}
            `.trim();

            const formatarTabela = (headers: string[], rows: string[][]) => {
                if (rows.length === 0) return 'Nenhum dado encontrado.';
                const headerRow = `| ${headers.join(' | ')} |`;
                const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
                const contentRows = rows.map(row => `| ${row.join(' | ')} |`).join('\n');
                return `${headerRow}\n${separatorRow}\n${contentRows}`;
            };

            const dadosDominios = projeto.dominios.map(d => [d.id.toString(), d.endereco, d.alias || '-']);
            const listaDominios = formatarTabela(['ID', 'Endereço', 'Alias'], dadosDominios);

            const dadosIps = projeto.ips.map(i => [i.id.toString(), i.endereco]);
            const listaIps = formatarTabela(['ID', 'Endereço'], dadosIps);

            const dadosServicos = projeto.ips.flatMap(i => i.portas.map(p => [i.endereco, p.numero.toString(), p.protocolo || '-', p.servico || '-', p.versao || '-']));
            const listaServicos = formatarTabela(['IP', 'Porta', 'Protocolo', 'Serviço', 'Versão'], dadosServicos);

            const dadosWhatweb = whatwebs.map(w => [
                w.dominio?.endereco || w.ip?.endereco || '-',
                w.plugin,
                w.valor
            ]);
            const listaWhatweb = formatarTabela(['Alvo', 'Plugin', 'Valor'], dadosWhatweb);

            const dadosDiretorios = diretorios.map(d => [
                d.dominio?.endereco || d.ip?.endereco || '-',
                d.caminho,
                d.status?.toString() || '-',
                d.tamanho?.toString() || '-'
            ]);
            const listaDiretorios = formatarTabela(['Alvo', 'Caminho', 'Status', 'Tamanho'], dadosDiretorios);

            const dadosVazamentos = vazamentos.map(v => [v.nome, v.tipo, v.observacoes || '-']);
            const listaVazamentos = formatarTabela(['Nome', 'Tipo', 'Observações'], dadosVazamentos);

            const dadosDeface = defaces.map(d => [d.dominio.endereco, d.url, d.fonte]);
            const listaDeface = formatarTabela(['Domínio', 'URL Deface', 'Fonte'], dadosDeface);

            const dadosPhishing = phishings.map(p => [p.dominio.endereco, p.alvo, p.fonte]);
            const listaPhishing = formatarTabela(['Domínio', 'Alvo', 'Fonte'], dadosPhishing);

            const dadosTakedowns = projeto.takedowns.map(t => [t.url, t.status, t.solicitadoEm.toISOString().split('T')[0]]);
            const listaTakedowns = formatarTabela(['URL', 'Status', 'Data Solicitação'], dadosTakedowns);

            conteudo = conteudo
                .replace(/{{NOME_PROJETO}}/g, projeto.nome)
                .replace('{{DATA_GERACAO}}', new Date().toLocaleDateString('pt-BR'))
                .replace('{{RESUMO_ESTATISTICAS}}', stats)
                .replace('{{LISTA_DOMINIOS}}', listaDominios)
                .replace('{{LISTA_IPS}}', listaIps)
                .replace('{{LISTA_SERVICOS}}', listaServicos)
                .replace('{{LISTA_WHATWEB}}', listaWhatweb)
                .replace('{{LISTA_DIRETORIOS}}', listaDiretorios)
                .replace('{{LISTA_VAZAMENTOS}}', listaVazamentos)
                .replace('{{LISTA_DEFACE}}', listaDeface)
                .replace('{{LISTA_PHISHING}}', listaPhishing)
                .replace('{{LISTA_TAKEDOWNS}}', listaTakedowns);

            this.bus.emit(NanoEvents.JOB_COMPLETED, {
                id,
                result: conteudo,
                executedCommand: 'relatorio_gerar'
            });

        } catch (erro: any) {
            this.bus.emit(NanoEvents.JOB_FAILED, {
                id,
                error: erro.message
            });
        }
    }
}
