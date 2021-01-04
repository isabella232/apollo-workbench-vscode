import { ApolloGateway, RemoteGraphQLDataSource, GatewayConfig, Experimental_UpdateServiceDefinitions } from "@apollo/gateway";
import { buildClientSchema, getIntrospectionQuery, parse, IntrospectionQuery, printIntrospectionSchema, printSchema } from 'graphql';
import { Headers } from "apollo-server-env";
import { ServiceDefinition } from '@apollo/federation';
import { ServerManager } from "./workbench/serverManager";
import { FileProvider, WorkbenchUri, WorkbenchUriType } from "./utils/files/fileProvider";
import { StateManager } from "./workbench/stateManager";
import { window } from "vscode";

function log(message: string) { console.log(`GATEWAY-${message}`); }

export class OverrideApolloGateway extends ApolloGateway {
    protected async loadServiceDefinitions(config: GatewayConfig): ReturnType<Experimental_UpdateServiceDefinitions> {
        if (StateManager.settings_tlsRejectUnauthorized) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '';
        else process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

        let newDefinitions: Array<ServiceDefinition> = [];

        let wb = FileProvider.instance.currrentWorkbench;
        if (wb) {
            for (var serviceName in wb.schemas) {
                const service = wb.schemas[serviceName];

                if (service.shouldMock) {
                    let typeDefs = parse(service.sdl);
                    let url = `http://localhost:${ServerManager.instance.portMapping[serviceName]}`;
                    newDefinitions.push({ name: serviceName, url, typeDefs });
                } else {
                    let typeDefs = await OverrideApolloGateway.getTypeDefs(service.url as string);
                    if (typeDefs) {
                        newDefinitions.push({ name: serviceName, url: service.url, typeDefs: parse(typeDefs) });

                        if (service.autoUpdateSchemaFromUrl)
                            FileProvider.instance.writeFile(WorkbenchUri.parse(serviceName, WorkbenchUriType.SCHEMAS), Buffer.from(typeDefs), { create: true, overwrite: true })
                    } else {
                        log("Falling back to schema defined in workbench");
                        newDefinitions.push({ name: serviceName, url: service.url, typeDefs: parse(service.sdl) });
                    }
                }
            }
        }

        return {
            isNewSchema: true,
            serviceDefinitions: newDefinitions
        };
    }

    public static async getTypeDefs(serviceURLOverride: string) {
        let source = new RemoteGraphQLDataSource({ url: serviceURLOverride, });

        try {
            const request = {
                query: 'query __ApolloGetServiceDefinition__ { _service { sdl } }',
                http: {
                    url: serviceURLOverride,
                    method: 'POST',
                    headers: new Headers()
                },
            };

            let { data, errors } = await source.process({ request, context: {} });
            if (data && !errors) {
                return data._service.sdl as string;
            } else if (errors) {
                errors.map(error => log(error.message));
                //If we got errors, it could be that the graphql server running at that url doesn't support Apollo Federation Spec
                //  In this case, we can try and get the server schema from introspection
                return await this.getSchemaByIntrospection(serviceURLOverride);
            }
        } catch (err) {
            log(`Do you have your service running? \n\t${err.message}`);
            return await this.getSchemaByIntrospection(serviceURLOverride);
        }

        return;
    }

    private static async getSchemaByIntrospection(serviceURLOverride: string, source?: RemoteGraphQLDataSource) {
        let introspectionQuery = getIntrospectionQuery();
        const request = {
            query: introspectionQuery,
            http: {
                url: serviceURLOverride,
                method: 'POST',
                headers: new Headers()
            },
        };
        if (!source) source = new RemoteGraphQLDataSource({ url: serviceURLOverride, });

        let { data, errors } = await source.process({ request, context: {} });
        if (data && !errors) {
            const schema = buildClientSchema(data as any);

            return printSchema(schema);
        } else if (errors) {
            errors.map(error => log(error.message));
            window.showErrorMessage(`Unable to get the schema from the underlying server running at ${serviceURLOverride}. Your GraphQL server must support the Apollo Federation specification or have introspection enabled`);
        }
    }
}