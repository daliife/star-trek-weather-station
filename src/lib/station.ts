import defaultStation from '../config/station.json';
import {
  fetchOpenMeteoCurrent,
  fetchOpenMeteoSeries as fetchOpenMeteoSeriesRaw,
} from '../../scripts/weather-series.mjs';
import type { StationConfig, WeatherSeries, WeatherSnapshot } from './types';

export const DEFAULT_STATION: StationConfig = defaultStation;

export function applyDocumentTitle(name: string): void {
  document.title = `Star Trek Weather Station · ${name}`;
}

export async function fetchOpenMeteoSnapshot(station: StationConfig): Promise<WeatherSnapshot> {
  return (await fetchOpenMeteoCurrent(station)) as WeatherSnapshot;
}

export async function fetchOpenMeteoSeries(station: StationConfig): Promise<WeatherSeries> {
  return (await fetchOpenMeteoSeriesRaw(station)) as WeatherSeries;
}
