import React, { useMemo, useState } from 'react';
import { Download, FileSpreadsheet, Printer } from 'lucide-react';
import { Button } from '../../ui/Button';
import { DataCard } from '../../ui/DataCard';
import { DemoNotice } from '../../ui/DemoNotice';
import { downloadTextFile, formatArea, formatCoord, formatDateBr } from '../../../utils/validation';
import type { AgrolynxWorkspaceData, AuthUser } from '../../../types/agrolynx';

interface ReportsModuleProps {
  workspace: AgrolynxWorkspaceData;
  user: AuthUser;
  selectedPropertyId: string;
}

export const ReportsModule: React.FC<ReportsModuleProps> = ({
  workspace,
  user,
  selectedPropertyId,
}) => {
  const [scopePropertyId, setScopePropertyId] = useState(
    selectedPropertyId || workspace.properties[0]?.id || ''
  );

  const property =
    workspace.properties.find((p) => p.id === scopePropertyId) ?? workspace.properties[0];

  const scopedData = useMemo(() => {
    if (!property) {
      return {
        plots: [],
        crops: [],
        soilSamples: [],
        observations: [],
        operations: [],
      };
    }
    return {
      plots: workspace.plots.filter((pl) => pl.propertyId === property.id),
      crops: workspace.crops.filter((c) => c.propertyId === property.id),
      soilSamples: workspace.soilSamples.filter((s) => s.propertyId === property.id),
      observations: workspace.observations.filter((o) => o.propertyId === property.id),
      operations: workspace.operations.filter((op) => op.propertyId === property.id),
    };
  }, [workspace, property]);

  const handleExportJson = () => {
    const payload = {
      geradoEm: new Date().toISOString(),
      plataforma: 'AGROLYNX (Etapa 1 - Ambiente Local)',
      responsavel: user.name,
      organizacao: user.organization,
      propriedade: property ?? null,
      ...scopedData,
    };
    downloadTextFile(
      `agrolynx-relatorio-${property?.id || 'geral'}.json`,
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
  };

  const handleExportCsv = () => {
    const header = ['Codigo_Talhao', 'Nome_Talhao', 'Area_ha', 'Sistema_Hidrico', 'Solo', 'Cultura', 'Estagio'];
    const rows = scopedData.plots.map((pl) => {
      const crop = scopedData.crops.find((c) => c.plotId === pl.id);
      return [
        pl.code,
        `"${pl.name.replace(/"/g, '""')}"`,
        String(pl.areaHa),
        pl.irrigationSystem,
        `"${pl.soilTextureClass.replace(/"/g, '""')}"`,
        crop ? `"${crop.cropName} - ${crop.cultivar}"` : 'Sem cultura',
        crop ? crop.stage : '-',
      ].join(';');
    });
    const csv = [header.join(';'), ...rows].join('\n');
    downloadTextFile(
      `agrolynx-talhoes-${property?.id || 'geral'}.csv`,
      '\uFEFF' + csv,
      'text/csv;charset=utf-8'
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 no-print">
        <div>
          <h1 className="text-2xl font-bold text-navy-900 font-display tracking-tight">
            Relatórios Técnicos e Exportação
          </h1>
          <p className="text-sm text-slate-600 mt-0.5">
            Consolidação dos dados cadastrados para impressão ou exportação em CSV e JSON.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="md"
            onClick={handleExportCsv}
            disabled={!property}
            icon={<FileSpreadsheet className="w-4 h-4" />}
          >
            Exportar CSV
          </Button>
          <Button
            variant="outline"
            size="md"
            onClick={handleExportJson}
            disabled={!property}
            icon={<Download className="w-4 h-4" />}
          >
            Exportar JSON
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={() => window.print()}
            disabled={!property}
            icon={<Printer className="w-4 h-4" />}
          >
            Imprimir / PDF
          </Button>
        </div>
      </div>

      {workspace.properties.length > 0 && (
        <div className="flex items-center gap-3 no-print">
          <label htmlFor="report-prop" className="text-xs font-medium text-slate-600">
            Propriedade do relatório:
          </label>
          <select
            id="report-prop"
            value={property?.id || ''}
            onChange={(e) => setScopePropertyId(e.target.value)}
            className="min-h-[38px] rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-navy-900"
          >
            {workspace.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {property?.isDemo && (
        <div className="no-print">
          <DemoNotice
            variant="demo"
            title="Relatório contendo registros demonstrativos"
            description="Os itens marcados como Exemplo servem para validar a estrutura de exportação e impressão."
          />
        </div>
      )}

      <DataCard
        title="Pré-visualização do Boletim Agronômico"
        subtitle={
          property
            ? `${property.name} · ${property.municipality}/${property.state}`
            : 'Nenhuma propriedade selecionada'
        }
      >
        {!property ? (
          <p className="text-xs text-slate-500">
            Cadastre uma propriedade para gerar a pré-visualização técnica.
          </p>
        ) : (
          <div className="space-y-6 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-slate-200">
              <div>
                <p className="text-slate-500">Responsável técnico</p>
                <p className="font-semibold text-navy-900 mt-0.5">{user.name}</p>
              </div>
              <div>
                <p className="text-slate-500">Organização</p>
                <p className="font-medium text-slate-800 mt-0.5">{user.organization}</p>
              </div>
              <div>
                <p className="text-slate-500">Área cadastrada</p>
                <p className="font-mono font-semibold text-navy-900 tabular-nums mt-0.5">
                  {formatArea(property.totalAreaHa, workspace.preferences.areaUnit)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Coordenadas</p>
                <p className="font-mono text-slate-700 tabular-nums mt-0.5">
                  {formatCoord(property.centroid.lat, 'lat')} ·{' '}
                  {formatCoord(property.centroid.lon, 'lon')}
                </p>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-navy-900 mb-2">
                1. Talhões e Culturas ({scopedData.plots.length})
              </h3>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-3 font-medium">Código</th>
                    <th className="py-2 pr-3 font-medium">Talhão</th>
                    <th className="py-2 pr-3 font-medium text-right">Área</th>
                    <th className="py-2 font-medium">Cultura vinculada</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {scopedData.plots.map((pl) => {
                    const crop = scopedData.crops.find((c) => c.plotId === pl.id);
                    return (
                      <tr key={pl.id}>
                        <td className="py-2 pr-3 font-mono font-semibold text-navy-900">
                          {pl.code}
                        </td>
                        <td className="py-2 pr-3 text-slate-800">{pl.name}</td>
                        <td className="py-2 pr-3 text-right font-mono tabular-nums">
                          {formatArea(pl.areaHa, workspace.preferences.areaUnit)}
                        </td>
                        <td className="py-2 text-slate-700">
                          {crop ? `${crop.cropName} (${crop.cultivar})` : 'Sem cultura'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2 border-t border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-navy-900 mb-2">
                  2. Análises de Solo ({scopedData.soilSamples.length})
                </h3>
                {scopedData.soilSamples.length === 0 ? (
                  <p className="text-slate-500">Sem amostras registradas.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {scopedData.soilSamples.map((s) => (
                      <li key={s.id} className="text-slate-700 font-mono tabular-nums">
                        {formatDateBr(s.collectedAt)} · {s.depthLabel} · pH {s.phH2O.toFixed(1)} ·
                        Argila {s.clayPercent}%
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-navy-900 mb-2">
                  3. Operações Planejadas ({scopedData.operations.length})
                </h3>
                {scopedData.operations.length === 0 ? (
                  <p className="text-slate-500">Sem operações agendadas.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {scopedData.operations.map((op) => (
                      <li key={op.id} className="text-slate-700">
                        <span className="font-mono tabular-nums">
                          {formatDateBr(op.scheduledDate)}
                        </span>{' '}
                        · {op.title} ({op.status})
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <p className="text-[11px] text-slate-500 pt-4 border-t border-slate-100">
              Documento gerado localmente pelo AGROLYNX. Fontes NASA POWER, Earthdata, GPM IMERG,
              SMAP, ECOSTRESS e SoilGrids permanecem aguardando ativação de backend.
            </p>
          </div>
        )}
      </DataCard>
    </div>
  );
};
