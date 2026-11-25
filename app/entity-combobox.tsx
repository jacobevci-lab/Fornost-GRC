'use client';
import {FindingReferencePicker} from './findings/reference-picker';
import {foldSearch} from './record-search-store';

/** Shared single-input, keyboard-accessible canonical record selection. */
export function EntityCombobox({label,options,value,onChange,tr,state='ready',retry=()=>{}}:{label:string;options:{id:string;code:string;title:string}[];value:string;onChange:(id:string)=>void;tr:boolean;state?:'ready'|'loading'|'error';retry?:()=>void}){
 return <FindingReferencePicker label={label} targets={options.map(o=>({...o,module:'',owner:'',searchText:foldSearch(o.code+' '+o.title)}))} value={value} onChange={onChange} tr={tr} state={state} retry={retry}/>;
}
