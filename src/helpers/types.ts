import { DataQuery, DataQueryRequest, DataSourceJsonData, VariableModel } from '@grafana/data';
import { TemplateSrv as GrafanaTemplateSrv } from '@grafana/runtime';

declare module '@grafana/runtime' {
    export interface TemplateSrv extends GrafanaTemplateSrv {
        getAdhocFilters(datasourceName: string): any;
    }
}

export enum Format {
    Table = 'table',
    Timeseries = 'timeseries',
}
export interface Query extends DataQuery {
    formatAs: Format;
    metric: string;
    groupBy: string;
    splitOn: string;
    splitOnSec: string;
    aggregator: string;
    limit: number;
    sort: string;
    disableTimerange: boolean;
    invertOrder: boolean;
    cumulative: boolean;
    filter: string;
    target: string;
    type: string;
    data: string;
}

export const defaultQuery: Partial<Query> = {
    formatAs: Format.Timeseries,
    metric: "",
    groupBy: "",
    splitOn: "",
    splitOnSec: "",
    aggregator: "",
    limit: 0,
    sort: "",
    disableTimerange: false,
    invertOrder: false,
    cumulative: false,
    filter: "",
    target: "",
    type: Format.Timeseries,
    data: ""
};

export interface VariableQuery {
    query: string;
    format: 'string' | 'json';
}

/**
 * These are options configured for each DataSource instance
 */
export interface DataSourceOptions extends DataSourceJsonData {
    path?: string;
}

/**
 * Value that is used in the backend, but never sent over HTTP to the frontend
 */
export interface SecureJsonData {
    apiKey?: string;
}



export interface DataSourceOptions extends DataSourceJsonData { }
export interface QueryRequest extends DataQueryRequest<Query> {
    adhocFilters?: any[];
}

export interface TextValuePair {
    text: string;
    value: any;
}

export interface MultiValueVariable extends VariableModel {
    allValue: string | null;
    id: string;
    current: TextValuePair;
    options: TextValuePair[];
}

export interface MetricFindValue {
    value: any;
    text: string;
}

export interface MetricFindTagKeys extends MetricFindValue {
    key: string;
    type: string;
    text: string;
}

export interface MetricFindTagValues extends MetricFindValue {
    key: string;
    text: string;
}