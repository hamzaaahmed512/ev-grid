'use client';
import {AreaChart,Area,XAxis,YAxis,CartesianGrid,Tooltip,ResponsiveContainer,BarChart,Bar} from 'recharts';
import {money} from '../lib/data';
type Props={data:{name:string;amount:number}[];kind?:'area'|'bar'};
export default function RevenueChart({data,kind='area'}:Props){
 const axes=<><CartesianGrid stroke="#ecf1ec" vertical={false}/><XAxis dataKey="name" tickLine={false} axisLine={false}/><YAxis tickLine={false} axisLine={false} tickFormatter={n=>`${Math.round(n/1000)}k`}/><Tooltip formatter={n=>money(Number(n))}/></>;
 return <ResponsiveContainer width="100%" height="100%">{kind==='bar'?<BarChart data={data}>{axes}<Bar dataKey="amount" fill="#16803c" radius={[7,7,0,0]} isAnimationActive={false}/></BarChart>:<AreaChart data={data}><defs><linearGradient id="greenShade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#22a356" stopOpacity={.2}/><stop offset="100%" stopColor="#22a356" stopOpacity={0}/></linearGradient></defs>{axes}<Area type="monotone" dataKey="amount" stroke="#16803c" strokeWidth={3} fill="url(#greenShade)" isAnimationActive={false}/></AreaChart>}</ResponsiveContainer>;
}
