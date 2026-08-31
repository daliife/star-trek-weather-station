/// <reference path="../.astro/types.d.ts" />

declare module '../../scripts/weather-series.mjs' {
  export function fetchOpenMeteoCurrent(station: {
    stationId: string;
    name: string;
    region: string;
    country: string;
    lat: number;
    lon: number;
  }): Promise<unknown>;
  export function fetchOpenMeteoSeries(station: { lat: number; lon: number }): Promise<unknown>;
}

