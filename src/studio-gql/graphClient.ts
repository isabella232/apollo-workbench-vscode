import fetch from 'node-fetch';
import { createHttpLink, execute, FetchResult, gql, toPromise } from '@apollo/client/core';
import { UserMemberships } from './types/UserMemberships';
import { AccountServiceVariants } from './types/AccountServiceVariants';
import { GetGraphSchemas } from './types/GetGraphSchemas';
import { GraphOperations } from './types/GraphOperations';

const userMemberships = gql`
    query UserMemberships {
        me {
            ... on User {   
                memberships {
                    account {
                        id
                    }
                }
            }
        }
    }`;
const accountServiceVariants = gql`
    query AccountServiceVariants($accountId: ID!) {
        account(id: $accountId) {
            services {
                id
                variants {
                    name
                }
            }
        }
    }`
const getGraphSchemas = gql`
    query GetGraphSchemas($id: ID!, $graphVariant: String!) {
      service(id: $id) {
        implementingServices(graphVariant: $graphVariant){
          ...on FederatedImplementingServices{
            services {
              name
              url
              activePartialSchema {
                sdl
              }
            }
          }
        }
      }
    }
  `;
const getGraphOperations = gql`
  query GraphOperations($id: ID! $from: Timestamp!) {
      service(id: $id) {
          stats(from: $from) {
              queryStats {
                  groupBy {
                      clientName
                      clientVersion
                      queryName
                      queryId  
                      querySignature
                  }
              }
          }
      }
  }`
// const querySignatureQuery = gql`
//   query QuerySignatureQuery(
//     $serviceId: ID!
//     $queryId: ID!
//     $timeFrom: Timestamp!
//     $timeTo: Timestamp!
//   ) {
//     service(id: $serviceId) {
//       id
//       stats(from: $timeFrom, to: $timeTo) {
//         queryStats(filter: { queryId: $queryId }) {
//           group: groupBy {
//             id: queryId
//             signature: querySignature
//             name: queryName
//           }
//         }
//       }
//     }
//   }
// `;

export async function getUserMemberships(apiKey: string) {
    let result = await toPromise(execute(createLink(apiKey), { query: userMemberships }));
    return result.data as UserMemberships
}

export async function getAccountGraphs(apiKey: string, accountId: string) {
    let result = await toPromise(execute(createLink(apiKey), {
        query: accountServiceVariants,
        variables: {
            "accountId": accountId
        }
    }));
    return result.data as AccountServiceVariants
}

export async function getGraphOps(apiKey: string, graphId: string) {
    let result = await toPromise(execute(createLink(apiKey), {
        query: getGraphOperations,
        variables: {
            "id": graphId,
            "from": (-86400 * 30).toString()
        }
    }));
    return result.data as GraphOperations
}

export async function getGraphSchemasByVariant(apiKey: string, serviceId: string, graphVariant: string) {
    let result = await toPromise(execute(createLink(apiKey), {
        query: getGraphSchemas,
        variables: {
            "id": serviceId,
            "graphVariant": graphVariant
        }
    }));
    return result.data as GetGraphSchemas
}

function createLink(apiKey: string) {
    return createHttpLink({
        fetch,
        uri: `https://engine-graphql.apollographql.com/api/graphql`,
        headers: {
            'x-api-key': apiKey,
            'apollographql-client-name': 'Apollo Workbench',
            'apollographql-client-version': '0.1'
        }
    });
}