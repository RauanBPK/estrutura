import MenuExplorer from "./MenuExplorer"
import { StyledExplorer, ExplorerHeader, ExplorerBody } from "./styles"
import { useContext, useState } from "react"
import StoreContext from "@/store"
import { viewRegistry, getDefaultView } from "@/config/viewRegistry"
import { Input, Button, message, Tooltip } from "antd"
import { SearchOutlined } from "@ant-design/icons"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faFileExport } from "@fortawesome/free-solid-svg-icons"
import useApi from "@/api"

const Explorer = () => {
    const { explorer, projeto } = useContext(StoreContext);
    const api = useApi();
    const [loadingExport, setLoadingExport] = useState(false);

    const currentViewKey = explorer?.get() || 'domain';
    const CurrentView = viewRegistry[currentViewKey] || getDefaultView();

    const handleExport = async () => {
        const proj = projeto.get();
        if (!proj) {
            message.error("Nenhum projeto selecionado");
            return;
        }

        setLoadingExport(true);
        try {
            message.loading({ content: "Solicitando geração do relatório...", key: 'export' });
            const cmd = await api.queue.addCommand('relatorio_gerar', {}, proj.id);

            const checkStatus = async () => {
                try {
                    const queue = await api.queue.getCommands(proj.id);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const myCmd = queue.find((c: any) => c.id === cmd.id);
                    if (myCmd) {
                        if (myCmd.status === 'COMPLETED') {
                             const blob = new Blob([myCmd.output || ""], { type: 'text/markdown' });
                             const url = URL.createObjectURL(blob);
                             const a = document.createElement('a');
                             a.href = url;
                             a.download = `relatorio_${proj.nome.replace(/\s+/g, '_')}.md`;
                             a.click();
                             URL.revokeObjectURL(url);
                             message.success({ content: "Relatório gerado com sucesso!", key: 'export' });
                             setLoadingExport(false);
                        } else if (myCmd.status === 'FAILED') {
                            message.error({ content: "Falha ao gerar relatório.", key: 'export' });
                            setLoadingExport(false);
                        } else {
                            setTimeout(checkStatus, 2000);
                        }
                    } else {
                         setTimeout(checkStatus, 2000);
                    }
                } catch (e) {
                     console.error(e);
                     message.error({ content: "Erro ao verificar status.", key: 'export' });
                     setLoadingExport(false);
                }
            };
            setTimeout(checkStatus, 1000);

        } catch (error) {
            message.error({ content: "Erro ao solicitar relatório.", key: 'export' });
            setLoadingExport(false);
        }
    };

    return <StyledExplorer>
        <ExplorerHeader>
            <MenuExplorer />
            <div style={{ display: 'flex', gap: '8px' }}>
                <Input
                    prefix={<SearchOutlined style={{ color: 'rgba(0,0,0,.25)' }} />}
                    placeholder="Filtrar ativos..."
                    variant="filled"
                    size="small"
                    style={{ flex: 1 }}
                />
                <Tooltip title="Exportar Relatório">
                    <Button
                        size="small"
                        icon={<FontAwesomeIcon icon={faFileExport} />}
                        onClick={handleExport}
                        loading={loadingExport}
                    />
                </Tooltip>
            </div>
        </ExplorerHeader>
        <ExplorerBody>
            {CurrentView}
        </ExplorerBody>
    </StyledExplorer>
}

export default Explorer
