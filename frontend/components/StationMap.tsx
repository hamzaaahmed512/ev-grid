'use client';
import {useEffect,useRef} from 'react';
import type {Station} from '../lib/data';
type Props={stations:Station[];selected:number|null;onSelect:(id:number)=>void};
export default function StationMap({stations,selected,onSelect}:Props){
 const node=useRef<HTMLDivElement>(null);const map=useRef<import('leaflet').Map|null>(null);const markers=useRef<import('leaflet').Marker[]>([]);
 useEffect(()=>{let alive=true;import('leaflet').then(L=>{if(!alive||!node.current||map.current)return;map.current=L.map(node.current,{scrollWheelZoom:false}).setView([31.5204,74.3587],11);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap contributors',maxZoom:19}).addTo(map.current);setTimeout(()=>map.current?.invalidateSize(),200);});return()=>{alive=false;map.current?.remove();map.current=null}},[]);
 useEffect(()=>{if(!node.current)return;const observer=new ResizeObserver(()=>map.current?.invalidateSize());observer.observe(node.current);return()=>observer.disconnect()},[]);
 useEffect(()=>{let live=true;import('leaflet').then(L=>{if(!live||!map.current)return;markers.current.forEach(x=>x.remove());markers.current=stations.map(s=>{const active=s.id===selected;const icon=L.divIcon({html:`<div style="background:${active?'#14532d':s.available?'#16a34a':'#f59e0b'};width:${44}px;height:${44}px;border-radius:50%;border:3px solid white;box-shadow:0 4px 15px #0003;color:white;display:grid;place-items:center;font-size:17px;font-weight:800">⚡</div>`,className:'',iconSize:[44,44],iconAnchor:[22,22]});let marker=L.marker([s.lat,s.lng],{icon}).addTo(map.current!);marker.bindTooltip(s.name);marker.on('click',()=>onSelect(s.id));return marker});if(selected){const s=stations.find(s=>s.id===selected);if(s)map.current!.flyTo([s.lat,s.lng],12,{duration:.6})}else if(stations.length){const bounds=L.latLngBounds(stations.map(s=>[s.lat,s.lng]));map.current!.fitBounds(bounds,{padding:[35,35],maxZoom:12})}});return()=>{live=false}},[stations,selected,onSelect]);
 return <div className="map-surface" ref={node} aria-label="Charging station map"/>;
}

