export const CREATE_RELATIONSHIP = (type: string) => `
  MATCH (a:Entity {id: $from})
  MATCH (b:Entity {id: $to})
  CREATE (a)-[r:${type} $props]->(b)
  RETURN r
`;

export const GET_OUTGOING_RELATIONSHIPS = `
  MATCH (e:Entity {id: $entityId})-[r]->(target)
  RETURN type(r) as type, r as rel, target.id as targetId
`;

export const GET_INCOMING_RELATIONSHIPS = `
  MATCH (source)-[r]->(e:Entity {id: $entityId})
  RETURN type(r) as type, r as rel, source.id as sourceId
`;

export const GET_ALL_RELATIONSHIPS = `
  MATCH (e:Entity {id: $entityId})-[r]-(other)
  RETURN type(r) as type, r as rel, other.id as otherId
`;
