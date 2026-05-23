// client/src/components/Dashboard/widgetMap.js
import { CpuKpi }         from './widgets/CpuKpi';
import { RamKpi }         from './widgets/RamKpi';
import { TpsKpi }         from './widgets/TpsKpi';
import { MsptKpi }        from './widgets/MsptKpi';
import { PlayersKpi }     from './widgets/PlayersKpi';
import { UptimeKpi }      from './widgets/UptimeKpi';
import { ResourceChart }       from './widgets/ResourceChart';
import { ConnectionWidget }    from './widgets/ConnectionWidget';
import { OnlinePlayersWidget } from './widgets/OnlinePlayersWidget';
import { ActiveProfileWidget } from './widgets/ActiveProfileWidget';
import { ScheduledTasksWidget } from './widgets/ScheduledTasksWidget';

export const WIDGET_MAP = {
    'cpu-kpi':         CpuKpi,
    'ram-kpi':         RamKpi,
    'tps-kpi':         TpsKpi,
    'mspt-kpi':        MsptKpi,
    'players-kpi':     PlayersKpi,
    'uptime-kpi':      UptimeKpi,
    'resource-chart':  ResourceChart,
    'connection':      ConnectionWidget,
    'online-players':  OnlinePlayersWidget,
    'active-profile':  ActiveProfileWidget,
    'scheduled-tasks': ScheduledTasksWidget,
};
