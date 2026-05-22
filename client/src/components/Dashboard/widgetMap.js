// client/src/components/Dashboard/widgetMap.js
import { CpuKpi } from './widgets/CpuKpi';
import { RamKpi } from './widgets/RamKpi';
import { PlayersKpi } from './widgets/PlayersKpi';
import { StatusKpi } from './widgets/StatusKpi';
import { UptimeKpi } from './widgets/UptimeKpi';
import { ProfileKpi } from './widgets/ProfileKpi';
import { ResourceChart } from './widgets/ResourceChart';
import { ServerInfoWidget } from './widgets/ServerInfoWidget';
import { OnlinePlayersWidget } from './widgets/OnlinePlayersWidget';
import { ActiveProfileWidget } from './widgets/ActiveProfileWidget';
import { QuickActionsWidget } from './widgets/QuickActionsWidget';

export const WIDGET_LABELS = {
    'cpu-kpi':        'CPU',
    'ram-kpi':        'RAM',
    'players-kpi':    'Oyuncular',
    'status-kpi':     'Durum',
    'uptime-kpi':     'Uptime',
    'profile-kpi':    'Profil',
    'resource-chart': 'Kaynak Grafiği',
    'server-info':    'Sunucu Bilgisi',
    'online-players': 'Online Oyuncular',
    'active-profile': 'Aktif Profil',
    'quick-actions':  'Hızlı İşlemler',
};

export const WIDGET_MAP = {
    'cpu-kpi':        CpuKpi,
    'ram-kpi':        RamKpi,
    'players-kpi':    PlayersKpi,
    'status-kpi':     StatusKpi,
    'uptime-kpi':     UptimeKpi,
    'profile-kpi':    ProfileKpi,
    'resource-chart': ResourceChart,
    'server-info':    ServerInfoWidget,
    'online-players': OnlinePlayersWidget,
    'active-profile': ActiveProfileWidget,
    'quick-actions':  QuickActionsWidget,
};
