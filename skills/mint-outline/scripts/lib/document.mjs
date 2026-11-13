// Local document and production checks. No strategy registry or sibling dependencies.
export const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export const nonempty = x => typeof x === 'string' && x.trim().length > 0;
export function documentErrors(doc, production) {
 const errors=[];
 if(doc?.creativeBrief!==undefined&&!nonempty(doc.creativeBrief)) errors.push('creativeBrief must be a non-empty string');
 if(production!==undefined) {
  if(!object(production)||production.schemaVersion!==3) errors.push('production.schemaVersion must be 3');
  if(production?.creativeBrief!==undefined&&!nonempty(production.creativeBrief)) errors.push('production.creativeBrief must be a non-empty string');
  if(nonempty(doc?.creativeBrief)&&nonempty(production?.creativeBrief)) errors.push('creativeBrief: merge project and local requirements manually into production, then remove local copy');
  else if(nonempty(doc?.creativeBrief)) errors.push('creativeBrief: move local requirements into production before project delivery');
 }
 return errors;
}
