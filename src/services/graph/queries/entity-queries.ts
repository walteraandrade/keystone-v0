export const CREATE_ENTITY = (entityType: string) => `
  CREATE (e:${entityType}:Entity $props)
  RETURN e.id as id
`;

export const GET_ENTITY = `
  MATCH (e:Entity {id: $id})
  RETURN e
`;

export const UPDATE_ENTITY = `
  MATCH (e:Entity {id: $id})
  SET e += $updates, e.updatedAt = datetime()
  RETURN e
`;

export const DELETE_ENTITY = `
  MATCH (e:Entity {id: $id})
  DETACH DELETE e
`;

export const FIND_LATEST_BY_BUSINESS_KEY = (entityType: string, businessKey: string) => `
  MATCH (e:${entityType} {${businessKey}: $value})
  WHERE NOT (e)-[:SUPERSEDES]->()
  RETURN e.id as id
  LIMIT 1
`;
