/** Keep words and short parenthetical expressions together. Only a single token
 * wider than its whole column (e.g. a URL/hash) needs a grapheme fallback. */
export function wrapReportText(value:string,maxWidth:number,measure:(text:string)=>number):string[]{
 if(maxWidth<=0)throw new Error('Invalid report column width');
 const output:string[]=[];
 for(const paragraph of value.normalize('NFC').split('\n')){
  let line='';
  const chunks=paragraph.match(/\([^()\n]*\)|\S+/gu)||[];
  const tokens=chunks.flatMap(chunk=>measure(chunk)<=maxWidth?[chunk]:chunk.split(/\s+/u));
  for(const token of tokens){
   const joined=line?line+' '+token:token;
   if(measure(joined)<=maxWidth){line=joined;continue;}
   if(line){output.push(line);line='';}
   if(measure(token)<=maxWidth){line=token;continue;}
   for(const {segment} of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(token)){
    if(line&&measure(line+segment)>maxWidth){output.push(line);line='';}
    line+=segment;
   }
  }
  output.push(line);
 }
 return output;
}
// A4 landscape content width: 842 - 2 × 36 = 770 points.
export const REPORT_COLUMN_WIDTHS=[72,100,216,82,112,108,80];
export const PBC_COLUMN_WIDTHS=[72,125,202,110,100,91,70];
