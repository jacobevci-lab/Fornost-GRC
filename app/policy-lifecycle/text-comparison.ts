type Part = {text:string;changed:boolean};
function segments(tokens:string[],same:Set<number>):Part[]{
  const parts:Part[]=[];
  tokens.forEach((text,i)=>{
    const changed=!same.has(i),last=parts.at(-1);
    if(last&&last.changed===changed)last.text+=text;
    else parts.push({text,changed});
  });
  return parts;
}

/** Align the differing middle only. Fall back to both full texts when the comparison would be too expensive. */
export function comparePolicyText(before:string,after:string){
  const words=(text:string)=>text.match(/\s+|[\p{L}\p{M}\p{N}_]+|[^\s\p{L}\p{M}\p{N}_]/gu)||[];
  const a=words(before),b=words(after),left=new Set<number>(),right=new Set<number>();
  let start=0,endA=a.length,endB=b.length;
  while(start<endA&&start<endB&&a[start]===b[start]){left.add(start);right.add(start++);}
  while(endA>start&&endB>start&&a[endA-1]===b[endB-1]){left.add(--endA);right.add(--endB);}
  const n=endA-start,m=endB-start;
  if(n*m>180000)return {before:[{text:before,changed:false}],after:[{text:after,changed:false}],highlighted:false};
  if(n&&m){
    const stride=m+1,table=new Uint32Array((n+1)*stride);
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--){
      const idx=i*stride+j;
      table[idx]=a[start+i]===b[start+j]?1+table[idx+stride+1]:Math.max(table[idx+stride],table[idx+1]);
    }
    let i=0,j=0;
    while(i<n&&j<m){
      if(a[start+i]===b[start+j]){left.add(start+i++);right.add(start+j++);}
      else if(table[(i+1)*stride+j]>=table[i*stride+j+1])i++;else j++;
    }
  }
  return {before:segments(a,left),after:segments(b,right),highlighted:true};
}
