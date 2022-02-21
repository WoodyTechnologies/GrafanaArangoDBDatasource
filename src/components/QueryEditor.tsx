import React, { ComponentType, useState, useEffect } from 'react';

import { InlineField, InlineFieldRow, InlineFormLabel, RadioButtonGroup, Select, Input, InlineSwitch, InlineLabel } from '@grafana/ui';
import { QueryEditorProps, SelectableValue } from '@grafana/data';

import defaults from 'lodash/defaults';

import { DataSource } from '../datasource';
import { Format, DataSourceOptions, Query, defaultQuery } from '../helpers';

type Props = QueryEditorProps<DataSource, Query, DataSourceOptions>;

export const QueryEditor: ComponentType<Props> = ({ datasource, onChange, onRunQuery, query }) => {

  const [isMetricOptionsLoading, setIsMetricOptionsLoading] = useState<boolean>(false);
  const [metricOptions, setMetricOptions] = useState<Array<SelectableValue<string>>>([]);
  const [groupByOptions, setGroupByOptions] = useState<Array<SelectableValue<string>>>([]);
  const [splitOnOptions, setSplitOnOptions] = useState<Array<SelectableValue<string>>>([]);
  const [aggregatorOptions, setAggregatorOptions] = useState<Array<SelectableValue<string>>>([]);

  const formatAsOptions: Array<SelectableValue<Format>> = [
    { label: 'Time series', value: Format.Timeseries, description: "For graph of metrics over time" },
    { label: 'Table', value: Format.Table, description: "For stats on metrics" },
  ];

  const sortOptions: Array<SelectableValue<string>> = [
    { label: "ASCENDING", value: "asc" },
    { label: "DESCENDING", value: "desc" }
  ]

  query = defaults(query, defaultQuery);
  const { formatAs, metric, groupBy, splitOn, splitOnSec, aggregator, limit, sort, disableTimerange, invertOrder, cumulative, filter } = query;

  function loadMetrics() {
    setIsMetricOptionsLoading(true)
    datasource.metricFindQuery({ query: '', format: 'string' }, undefined)
      .then(res => {
        setMetricOptions(res)
        setIsMetricOptionsLoading(false)
      },
        res => {
          setIsMetricOptionsLoading(false);
          setMetricOptions([]);
          throw new Error(res.statusText);
        })
  }

  function loadSplitOn() {
    datasource.fieldsQuery("split_on", metric)
      .then(setSplitOnOptions,
        res => {
          setSplitOnOptions([]);
          throw new Error(res.statusText);
        })
  }

  function loadGroupBy() {
    datasource.fieldsQuery("groupby", metric)
      .then(res => {
        res.unshift({ label: '__None__', value: '' });
        setGroupByOptions(res)
      },
        res => {
          setGroupByOptions([]);
          throw new Error(res.statusText);
        })
  }

  function loadAggregators() {
    datasource.fieldsQuery("aggregator", metric)
      .then(res => {
        setAggregatorOptions(res)
        onChange({ ...query, aggregator: res[0].value });
      },
        res => {
          setAggregatorOptions([]);
          throw new Error(res.statusText);
        })
  }

  function onValueChange(newQuery: Query) {
    onChange(newQuery)

    if (metric === undefined || metric === "") return;

    onRunQuery();
  }

  function testFilter(filter: string): boolean {
    const regex = /^\s*([a-zA-Z_)]+)\s*([=<>!]+)\s*(?<values>.+)\s*$/;
    if (filter.length === 0) return true;
    for (const element of filter.split("&&")) {
      const match = regex.exec(element);
      if (!match || match.groups && match.groups.values.trim().split(/\s*,\s*/).includes("")) {
        return false;
      }
    }
    return true;
  }

  useEffect(() => {
    loadMetrics();
    loadSplitOn();
    loadGroupBy();
    loadAggregators();
  }, [])

  useEffect(() => {
    loadSplitOn();
    loadGroupBy();
    loadAggregators();
  }, [metric])

  return (
    <>
      <InlineFieldRow>
        <div
          className='gf-form explore-input-margin'
          flex-wrap="nowrap">
          <InlineFormLabel width="auto">Format as: </InlineFormLabel>
          <RadioButtonGroup
            value={formatAs}
            options={formatAsOptions}
            onChange={v => onValueChange({ ...query, formatAs: v as Format, type: v as Format })}
          />
        </div>
        <InlineField>
          <Select
            isLoading={isMetricOptionsLoading}
            prefix="Metric: "
            options={metricOptions}
            placeholder="Select metric"
            allowCustomValue
            value={metric}
            onChange={v => onValueChange({ ...query, metric: v.value as string, target: v.value as string })}
          />
        </InlineField>
      </InlineFieldRow>

      <InlineFieldRow>
        <InlineField>
          <Select
            options={groupByOptions}
            prefix="Group by: "
            placeholder="Select group by parameter"
            allowCustomValue
            value={groupBy}
            onChange={v => onValueChange({ ...query, groupBy: v.value as string })}
          />
        </InlineField>
        <InlineField>
          <Select
            options={splitOnOptions}
            prefix="Split on: "
            placeholder="Select split on label"
            allowCustomValue
            value={splitOn}
            onChange={v => onValueChange({ ...query, splitOn: v.value as string })}
          />
        </InlineField>
        <InlineField hidden={formatAs === Format.Timeseries}>
          <Select
            options={splitOnOptions}
            prefix="Split on 2: "
            placeholder="Select split on a second label"
            allowCustomValue
            value={splitOnSec}
            onChange={v => onValueChange({ ...query, splitOnSec: v.value as string })}
          />
        </InlineField>
        <InlineField hidden={formatAs === Format.Table}
          tooltip="Timeseries for graph over time, Table for stats">
          <Select
            options={aggregatorOptions}
            prefix="Aggregator: "
            placeholder="Select aggregator operator"
            allowCustomValue
            value={aggregator}
            onChange={v => onValueChange({ ...query, aggregator: v.value as string })}
          />
        </InlineField>
        <InlineField hidden={formatAs === Format.Timeseries} label="Limit: "
          tooltip="-1 : no limit, if > 0, take the n first elements">
          <Input
            inputMode="numeric"
            value={limit}
            type="number"
            width={10}
            onChange={v => onValueChange({ ...query, limit: parseInt(v.currentTarget.value) })}
          />
        </InlineField>
        <InlineField hidden={formatAs === Format.Timeseries || limit as number < 1}>
          <div
            className='gf-form explore-input-margin'
            flex-wrap="nowrap">
            <InlineFormLabel width="auto">Sort: </InlineFormLabel>
            <RadioButtonGroup
              value={sort}
              options={sortOptions}
              onChange={v => onValueChange({ ...query, sort: v as string })}
            />
          </div>
        </InlineField>
        <InlineField label="Disable Timerange: " hidden={formatAs === Format.Timeseries}
          tooltip={"If activated, timerange isn't taken into account, all the database is crossed"}>
          <InlineSwitch
            label="Disable timerange: "
            value={disableTimerange}
            onChange={v => onValueChange({ ...query, disableTimerange: v.currentTarget.checked })}
          />
        </InlineField>
        <InlineField label="Invert Order: " hidden={formatAs === Format.Timeseries}
          tooltip="If activated, rows and columns are inverted">
          <InlineSwitch
            label="Invert order: "
            value={invertOrder}
            onChange={v => onValueChange({ ...query, invertOrder: v.currentTarget.checked })}
          />
        </InlineField>

        <InlineField hidden={formatAs === Format.Table} label="Cumulative: "
          tooltip="If activated, data is cumulated over time">
          <InlineSwitch
            label="Cumulative: "
            value={cumulative}
            onChange={v => onValueChange({ ...query, cumulative: v.currentTarget.checked })}
          />
        </InlineField>
      </InlineFieldRow>

      <InlineFieldRow>
        <InlineLabel tooltip={
          <>Write your filter here. Example : <code>user = Mickey , Mouse && time &lt;=&gt; 7, 12</code>
            <br />Operators
            : <code>=</code><code>&lt;</code><code>&gt;</code><code>&lt;=</code><code>&gt;=</code><code>&lt;&gt;</code><code>&lt;=&gt;</code><code>!=</code>
            <br />Syntax : <code>label1!=value1,value2 && label2 &lt; value1 && label3 = false</code>
          </>}>Filter : </InlineLabel>
        <Input
          placeholder="Write your filter here"
          invalid={!testFilter(filter as string)}
          label="Filter"
          height="10px"
          value={filter}
          onChange={v => onValueChange({ ...query, filter: v.currentTarget.value })}
        />
      </InlineFieldRow>
    </>
  );
}