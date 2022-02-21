import defaults from 'lodash/defaults';

import {
  AnnotationEvent,
  AnnotationQueryRequest,
  DataQueryResponse,
  DataSourceApi,
  DataSourceInstanceSettings,
  toDataFrame
} from '@grafana/data';

import { getBackendSrv, getTemplateSrv } from "@grafana/runtime"

import { Query, DataSourceOptions, defaultQuery, VariableQuery, Format, QueryRequest, TextValuePair, MultiValueVariable, MetricFindTagKeys, MetricFindTagValues } from './helpers';
import { isEqual, isObject } from 'lodash';

interface filter_type { [key: string]: { operator: string, values: any } }
const supportedVariableTypes = ['adhoc', 'constant', 'custom', 'interval', 'query', 'textbox'];

export class DataSource extends DataSourceApi<Query, DataSourceOptions> {

  url: string;
  withCredentials: boolean;
  headers: any;

  constructor(instanceSettings: DataSourceInstanceSettings<DataSourceOptions>) {
    super(instanceSettings);

    this.url = instanceSettings.url === undefined ? '' : instanceSettings.url;

    this.withCredentials = instanceSettings.withCredentials !== undefined;
    this.headers = { 'Content-Type': 'application/json' };
    if (typeof instanceSettings.basicAuth === 'string' && instanceSettings.basicAuth.length > 0) {
      this.headers['Authorization'] = instanceSettings.basicAuth;
    }
  }

  async query(options: QueryRequest): Promise<DataQueryResponse> {
    console.log(options)

    const request = this.parseTargets(options)

    request.adhocFilters = getTemplateSrv().getAdhocFilters(this.name);

    options.scopedVars = { ...this.getVariables(), ...options.scopedVars };

    const query = {
      url: `${this.url}/query`,
      data: request,
      method: 'POST',
    }

    return this.doRequest(query).then(entry => {
      entry.data = entry.data.map(toDataFrame);
      return entry;
    });
  }

  parseTargets(options: QueryRequest): QueryRequest {
    options.targets = options.targets
      .filter(target => target.target !== undefined)
      .map((target) => {
        target = defaults(target, defaultQuery)
        if (typeof target.target === 'string') {
          target.target = getTemplateSrv().replace(target.target.toString(), options.scopedVars, 'regex');
        }
        const data: {
          AGGREGATOR?: string, GROUPBY?: string, CUMULATIVE?: boolean, SPLIT_ON?: string | Array<string>,
          FILTER?: filter_type, INVERT_ORDER?: boolean, SORT?: string, LIMIT?: number, DISABLE_TIMERANGE?: boolean
        } = {};

        if (target.filter) {
          data.FILTER = this.parseFilter(target.filter);
        }
        if (target.groupBy) {
          data.GROUPBY = target.groupBy;
        }
        /* TABLE FORMAT */
        if (target.type === Format.Table) {
          if (target.disableTimerange) data.DISABLE_TIMERANGE = true;
          if (target.limit && target.limit > 0) {
            data.LIMIT = target.limit;
            if (target.sort) data.SORT = target.sort;
          }
          if (target.invertOrder) data.INVERT_ORDER = true;
          if (target.splitOn && target.splitOnSec) {
            data.SPLIT_ON = [target.splitOn, target.splitOnSec];
          } else if (target.splitOn) {
            data.SPLIT_ON = target.splitOn;
          } else if (target.splitOnSec) {
            data.SPLIT_ON = target.splitOnSec;
          }

          /* TIMESERIES FORMAT */
        } else if (target.type === Format.Timeseries) {
          data.AGGREGATOR = target.aggregator;
          if (target.cumulative) data.CUMULATIVE = true;
          if (target.splitOn) {
            data.SPLIT_ON = target.splitOn;
          }
        }
        target.data = JSON.stringify(data);
        return target
      })
    return options;
  }

  parseFilter(filter: string): filter_type {
    let filter_result: filter_type = {};
    for (const element of filter.split("&&")) {
      const match = element.trim().match(/^(?<name>[a-zA-Z_)]+)\s*(?<operator>[=<>!]+)\s*(?<values>.+)$/);
      if (!match || !match.groups) throw new Error("FILTER not conform");
      filter_result[match.groups.name] = {
        operator: match.groups.operator, values: match.groups.values.split(/\s*,\s*/).map((el: string) => {
          try {
            return JSON.parse(el);
          } catch (e) {
            return el;
          }
        })
      };
    }
    return filter_result;
  }

  getVariables() {
    const variables: { [id: string]: TextValuePair } = {};
    Object.values(getTemplateSrv().getVariables()).forEach((variable) => {
      if (!supportedVariableTypes.includes(variable.type)) {
        console.warn(`Variable of type "${variable.type}" is not supported`);

        return;
      }

      if (variable.type === 'adhoc') {
        // These are being added to request.adhocFilters
        return;
      }

      const supportedVariable = variable as MultiValueVariable;

      let variableValue = supportedVariable.current.value;
      if (variableValue === '$__all' || isEqual(variableValue, ['$__all'])) {
        if (supportedVariable.allValue === null || supportedVariable.allValue === '') {
          variableValue = supportedVariable.options.slice(1).map((textValuePair) => textValuePair.value);
        } else {
          variableValue = supportedVariable.allValue;
        }
      }

      variables[supportedVariable.id] = {
        text: supportedVariable.current.text,
        value: variableValue,
      };
    });

    return variables;
  }

  async metricFindQuery(variableQuery: VariableQuery, options?: any, type?: string): Promise<any> {

    const interpolated =
      variableQuery.format === 'json'
        ? JSON.parse(getTemplateSrv().replace(variableQuery.query, undefined, 'json'))
        : {
          type,
          target: getTemplateSrv().replace(variableQuery.query, undefined, 'regex'),
        };

    return this.doRequest({
      url: `${this.url}/search`,
      data: interpolated,
      method: 'POST',
    }).then(this.mapToLabelValue)
  }

  async fieldsQuery(field: string, metric: string): Promise<any> {
    return this.doRequest({
      url: `${this.url}/otherFields`,
      data: JSON.stringify({ field: field, metric: metric === "" ? undefined : metric }),
      method: 'POST',
    }).then(this.mapToLabelValue)
  }

  mapToLabelValue(result: any) {
    return result.data.map((d: any, i: any) => {
      if (d && d.text && d.value) {
        return { label: d.text, value: d.value };
      }

      if (isObject(d)) {
        return { label: d, value: i };
      }
      return { label: d, value: d };
    });
  }

  async doRequest(options: any) {
    options.withCredentials = this.withCredentials;
    options.headers = this.headers;

    return getBackendSrv().datasourceRequest(options);
  }

  async testDatasource() {
    const errorMessageBase = 'Data source is not working';

    try {
      const response = await this.doRequest({
        url: this.url,
        method: 'GET',
      });

      if (response.status === 200) {
        return { status: 'success', message: 'Data source is working', title: 'Success' };
      }

      return {
        message: response.statusText ? response.statusText : errorMessageBase,
        status: 'error',
        title: 'Error',
      };
    } catch (err: any) {
      if (typeof err === 'string') {
        return {
          status: 'error',
          message: err,
        };
      }

      let message = err.statusText ?? errorMessageBase;
      if (err.data?.error?.code !== undefined) {
        message += `: ${err.data.error.code}. ${err.data.error.message}`;
      }

      return { status: 'error', message, title: 'Error' };
    }
  }

  async annotationQuery(options: AnnotationQueryRequest<Query & { query: string; iconColor: string }>): Promise<AnnotationEvent[]> {
    const query = getTemplateSrv().replace(options.annotation.query, {}, 'glob');

    const annotationQuery = {
      annotation: {
        query,
        name: options.annotation.name,
        datasource: options.annotation.datasource,
        enable: options.annotation.enable,
        iconColor: options.annotation.iconColor,
      },
      range: options.range,
      rangeRaw: options.rangeRaw,
      variables: this.getVariables(),
    };

    return this.doRequest({
      url: `${this.url}/annotations`,
      method: 'POST',
      data: annotationQuery,
    }).then((result: any) => {
      return result.data;
    });
  }

  getTagKeys(options?: any): Promise<MetricFindTagKeys[]> {
    return new Promise((resolve) => {
      this.doRequest({
        url: `${this.url}/tag-keys`,
        method: 'POST',
        data: options,
      }).then((result: any) => {
        return resolve(result.data);
      });
    });
  }


  getTagValues(options: any): Promise<MetricFindTagValues[]> {
    return new Promise((resolve) => {
      this.doRequest({
        url: `${this.url}/tag-values`,
        method: 'POST',
        data: options,
      }).then((result: any) => {
        return resolve(result.data);
      });
    });
  }
}
