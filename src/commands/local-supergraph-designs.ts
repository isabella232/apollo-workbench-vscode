import { FileProvider } from "../workbench/file-system/fileProvider";
import { window, ProgressLocation, Uri, workspace, Range, StatusBarAlignment, tasks, Task } from "vscode";
import { StateManager } from "../workbench/stateManager";
import { createTypescriptTemplate } from "../utils/createTypescriptTemplate";
import { SubgraphTreeItem, OperationTreeItem, SubgraphSummaryTreeItem, SupergraphSchemaTreeItem, SupergraphApiSchemaTreeItem } from "../workbench/tree-data-providers/superGraphTreeDataProvider";
import { WorkbenchUri, WorkbenchUriType } from "../workbench/file-system/WorkbenchUri";
import { ServerManager } from "../workbench/serverManager";
import { StudioGraphVariantTreeItem, StudioGraphTreeItem, PreloadedWorkbenchFile } from "../workbench/tree-data-providers/apolloStudioGraphsTreeDataProvider";
import { ApolloWorkbenchFile } from "../workbench/file-system/fileTypes";
import { getGraphSchemasByVariant } from "../graphql/graphClient";
import { GetGraphSchemas_service_implementingServices_NonFederatedImplementingService, GetGraphSchemas_service_implementingServices_FederatedImplementingServices } from "../graphql/types/GetGraphSchemas";
import { resolve } from "path";
import { writeFileSync, existsSync } from "fs";
import { TextEncoder } from "util";
import { GraphQLSchema, parse, extendSchema, printSchema } from "graphql";
import { OverrideApolloGateway } from "../graphql/graphRouter";
import { generateJsFederatedResolvers } from "../utils/exportFiles";
import { getComposedSchema } from "../graphql/composition";

export function startMocks(item: SubgraphSummaryTreeItem) {
    ServerManager.instance.startSupergraphMocks(item.filePath);
}
export async function stopMocks(item: SubgraphTreeItem) {
    ServerManager.instance.stopMocks();
}
export async function editSubgraph(item: SubgraphTreeItem) {
    await window.showTextDocument(WorkbenchUri.supergraph(item.wbFilePath, item.subgraphName, WorkbenchUriType.SCHEMAS));
    FileProvider.instance.loadWorkbenchForComposition(item.wbFilePath);
}
export async function editSupergraphOperation(item: OperationTreeItem) {
    await window.showTextDocument(WorkbenchUri.supergraph(item.filePath, item.operationName, WorkbenchUriType.QUERIES));
}
export async function viewSubgraphSettings(item: SubgraphTreeItem) {
    await window.showTextDocument(WorkbenchUri.supergraph(item.wbFilePath, item.subgraphName, WorkbenchUriType.SCHEMAS_SETTINGS));
}
export async function addOperation(item: OperationTreeItem) {
    let wbFilePath = item.filePath;
    let wbFile = FileProvider.instance.workbenchFiles.get(wbFilePath);
    if (wbFile) {
        let operationName = await window.showInputBox({ placeHolder: "Enter a name for the operation" }) ?? "";
        if (!operationName) {
            const message = `Create schema cancelled - No name entered.`;
            console.log(message);
            window.setStatusBarMessage(message, 3000);
        } else {
            wbFile.operations[operationName] = `query ${operationName} {\n\t\n}`;
            FileProvider.instance.saveWorkbenchFile(wbFile, item.filePath);
        }
    }
}
export async function deleteOperation(item: OperationTreeItem) {
    let wbFilePath = item.filePath;
    let wbFile = FileProvider.instance.workbenchFiles.get(wbFilePath);
    let operationName = item.operationName;
    if (wbFile) {
        delete wbFile.operations[operationName];
        FileProvider.instance.saveWorkbenchFile(wbFile, item.filePath);
    }
}
export async function viewQueryPlan(item: OperationTreeItem) {
    await window.showTextDocument(WorkbenchUri.supergraph(item.filePath, item.operationName, WorkbenchUriType.QUERY_PLANS));
}
export async function viewSupergraphSchema(item: SupergraphSchemaTreeItem) {
    await window.showTextDocument(WorkbenchUri.supergraph(item.filePath, item.wbFile.graphName, WorkbenchUriType.SUPERGRAPH_SCHEMA));
    FileProvider.instance.loadWorkbenchForComposition(item.filePath);
}
export async function viewSupergraphApiSchema(item: SupergraphApiSchemaTreeItem) {
    await window.showTextDocument(WorkbenchUri.supergraph(item.filePath, item.wbFile.graphName, WorkbenchUriType.SUPERGRAPH_API_SCHEMA));
    FileProvider.instance.loadWorkbenchForComposition(item.filePath);
}
export function refreshSupergraphs() {
    StateManager.instance.localSupergraphTreeDataProvider.refresh();
}
export async function addSubgraph(item: SubgraphSummaryTreeItem) {
    let wbFile = item.wbFile;
    let serviceName = await window.showInputBox({ placeHolder: "Enter a unique name for the subgraph" }) ?? "";
    if (!serviceName) {
        const message = `Create schema cancelled - No name entered.`;
        console.log(message);
        window.setStatusBarMessage(message, 3000);
    } else {
        wbFile.schemas[serviceName] = { shouldMock: true, sdl: "", autoUpdateSchemaFromUrl: false };
        FileProvider.instance.saveWorkbenchFile(wbFile, item.filePath);
    }
}
export async function deleteSubgraph(item: SubgraphTreeItem) {
    let wbFilePath = item.wbFilePath;
    let wbFile = FileProvider.instance.workbenchFiles.get(wbFilePath);
    let subgraphName = item.subgraphName;
    if (wbFile) {
        delete wbFile.schemas[subgraphName];
        FileProvider.instance.saveWorkbenchFile(wbFile, item.wbFilePath);
    }
}
export async function newDesign() {
    if (!StateManager.workspaceRoot) {
        await FileProvider.instance.promptOpenFolder();
    } else {
        let workbenchName = await window.showInputBox({ placeHolder: "Enter name for workbench file" });
        if (!workbenchName) {
            const msg = 'No name was provided for the file.\n Cancelling new workbench create';
            console.log(msg);
            window.showErrorMessage(msg);
        } else {
            FileProvider.instance.createWorkbenchFileLocally(new ApolloWorkbenchFile(workbenchName));
        }
    }
}

export async function createWorkbenchFromSupergraphVariant(graphVariantTreeItem: StudioGraphVariantTreeItem) {
    if (!StateManager.workspaceRoot) {
        await FileProvider.instance.promptOpenFolder();
    } else {
        await createWorkbench(graphVariantTreeItem.graphId, graphVariantTreeItem.graphVariant);
    }
}

export async function createWorkbenchFromSupergraph(graphVariantTreeItem: StudioGraphTreeItem, selectedVariant?: string) {
    if (!StateManager.workspaceRoot) {
        await FileProvider.instance.promptOpenFolder();
    } else {
        const graphId = graphVariantTreeItem.graphId;
        const graphVariants = graphVariantTreeItem.variants;
        if (!selectedVariant) {
            if (graphVariants.length == 0) {
                selectedVariant = 'currrent'
            } else if (graphVariants.length == 1) {
                selectedVariant = graphVariants[0];
            } else {
                selectedVariant = await window.showQuickPick(graphVariants) ?? '';
            }
        }

        if (selectedVariant == '') {
            window.showInformationMessage("You must select a variant to load the graph from");
        } else {
            await createWorkbench(graphId, selectedVariant);
        }
    }
}
async function createWorkbench(graphId: string, selectedVariant: string) {
    let defaultGraphName = `${graphId}-${selectedVariant}-`;
    let graphName = await window.showInputBox({
        prompt: "Enter a name for your new workbench file",
        placeHolder: defaultGraphName,
        value: defaultGraphName
    });
    if (graphName) {
        let workbenchFile: ApolloWorkbenchFile = new ApolloWorkbenchFile(graphName);
        workbenchFile.graphName = graphName;

        const results = await getGraphSchemasByVariant(StateManager.instance.globalState_userApiKey, graphId, selectedVariant);
        const monolithicService = results.service?.implementingServices as GetGraphSchemas_service_implementingServices_NonFederatedImplementingService;
        if (monolithicService?.graphID) {
            workbenchFile.schemas['monolith'] = { sdl: results.service?.schema?.document, shouldMock: true, autoUpdateSchemaFromUrl: false };
        } else {
            const implementingServices = results.service?.implementingServices as GetGraphSchemas_service_implementingServices_FederatedImplementingServices;
            implementingServices?.services?.map(service => workbenchFile.schemas[service.name] = { sdl: service.activePartialSchema.sdl, url: service.url ?? "", shouldMock: true, autoUpdateSchemaFromUrl: false });
        }

        const { composedSdl } = await getComposedSchema(workbenchFile);
        if (composedSdl) workbenchFile.composedSchema = composedSdl;

        FileProvider.instance.createWorkbenchFileLocally(workbenchFile);
    } else {
        window.showInformationMessage("You must provide a name to create a new workbench file")
    }
}
const txtEncoder = new TextEncoder();
export async function exportSupergraphSchema(item: SupergraphSchemaTreeItem) {
    if (item.wbFile.composedSchema && StateManager.workspaceRoot) {
        const exportPath = `${StateManager.workspaceRoot}/${item.wbFile.graphName}-supergraph-schema.graphql`;

        workspace.fs.writeFile(Uri.parse(exportPath), txtEncoder.encode(item.wbFile.composedSchema));
        window.showInformationMessage(`Supergraph Schema was exported to ${exportPath}`);
    }
}

export async function exportSupergraphApiSchema(item: SupergraphApiSchemaTreeItem) {
    const supergraphSchema = item.wbFile.composedSchema;
    if (supergraphSchema && StateManager.workspaceRoot) {
        const exportPath = `${StateManager.workspaceRoot}/${item.wbFile.graphName}-api-schema.graphql`;
        const schema = new GraphQLSchema({
            query: undefined,
        });
        const parsed = parse(supergraphSchema);
        const finalSchema = extendSchema(schema, parsed, { assumeValidSDL: true });

        workspace.fs.writeFile(Uri.parse(exportPath), txtEncoder.encode(printSchema(finalSchema)));
        window.showInformationMessage(`Graph Core Schema was exported to ${exportPath}`);
    }
}

export async function updateSubgraphSchemaFromURL(item: SubgraphTreeItem) {
    if (StateManager.settings_tlsRejectUnauthorized) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '';
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

    let wbFile = FileProvider.instance.workbenchFiles.get(item.wbFilePath);
    if (wbFile?.schemas[item.subgraphName] && !wbFile?.schemas[item.subgraphName].url) {
        let routingURL = await window.showInputBox({ placeHolder: "Enter a the url for the schema/service" }) ?? "";
        if (!routingURL) {
            const message = `Set service URL cancelled for ${item.subgraphName} - No URL entered.`;
            console.log(message);
            window.setStatusBarMessage(message, 3000);
        } else {
            wbFile.schemas[item.subgraphName].url = routingURL;
        }

        if (wbFile?.schemas[item.subgraphName].url) {
            const sdl = await OverrideApolloGateway.getTypeDefs(wbFile.schemas[item.subgraphName].url ?? "", item.subgraphName);
            if (sdl) {
                wbFile.schemas[item.subgraphName].sdl = sdl;

                let editor = await window.showTextDocument(WorkbenchUri.supergraph(item.wbFilePath, item.subgraphName, WorkbenchUriType.SCHEMAS));
                if (editor) {
                    const document = editor.document;
                    await editor.edit((editor) => {
                        editor.replace(new Range(0, 0, document.lineCount, 0), sdl);
                    });
                    await document.save();
                }
            }

            FileProvider.instance.saveWorkbenchFile(wbFile, item.wbFilePath, false);
        } else {//No URL entered for schema
            window.showErrorMessage("You must set a url for the service if you want to update the schema from it.");
        }
    }
}

export async function viewSubgraphCustomMocks(item: SubgraphTreeItem) {
    const subgraphMocksUri = WorkbenchUri.supergraph(item.wbFilePath, item.subgraphName, WorkbenchUriType.MOCKS);
    if (!existsSync(subgraphMocksUri.fsPath)) {
        const defaultMocks = "const faker = require('faker')\n\nconst mocks = {\n\n}\nmodule.exports = mocks;";
        writeFileSync(subgraphMocksUri.fsPath, defaultMocks, { encoding: "utf-8" });
    }
    await window.showTextDocument(subgraphMocksUri);
}

export async function exportSubgraphSchema(item: SubgraphTreeItem) {
    const exportPath = StateManager.workspaceRoot ? `${StateManager.workspaceRoot}/${item.subgraphName}.graphql` : null;
    if (exportPath) {
        const schema = FileProvider.instance.workbenchFiles.get(item.wbFilePath)?.schemas[item.subgraphName]?.sdl;
        workspace.fs.writeFile(Uri.parse(exportPath), txtEncoder.encode(schema));

        window.showInformationMessage(`${item.subgraphName} schema was exported to ${exportPath}`);
    }
}

export async function exportSubgraphResolvers(item: SubgraphTreeItem) {
    let exportPath = StateManager.workspaceRoot ? `${StateManager.workspaceRoot}/${item.subgraphName}-resolvers` : null;
    if (exportPath) {
        let resolvers = '';
        const schema = FileProvider.instance.workbenchFiles.get(item.wbFilePath)?.schemas[item.subgraphName].sdl ?? "";
        resolvers = generateJsFederatedResolvers(schema);
        //TODO: Future Feature could have a more robust typescript generation version
        // let exportLanguage = await window.showQuickPick(["Javascript", "Typescript"], { canPickMany: false, placeHolder: "Would you like to use Javascript or Typescript for the exported project?" });
        // if (exportLanguage == "Typescript") {
        //     resolvers = generateTsFederatedResolvers(schema);
        //     exportPath += ".ts";
        // } else {
        //     resolvers = generateJsFederatedResolvers(schema);
        //     exportPath += ".js";
        // }

        workspace.fs.writeFile(Uri.parse(`${exportPath}.js`), txtEncoder.encode(resolvers));
        window.showInformationMessage(`${item.subgraphName} resolvers was exported to ${exportPath}`);
    }
}
export async function createWorkbenchFromPreloaded(preloadedItem: PreloadedWorkbenchFile) {
    await FileProvider.instance.copyPreloadedWorkbenchFile(preloadedItem.fileName);
}