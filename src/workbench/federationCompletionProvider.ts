import { CancellationToken, CompletionItem, CompletionItemKind, MarkdownString, Position, SnippetString, TextDocument } from "vscode";
import { extractDefinedEntitiesByService } from "../utils/csdlParser";
import { getServiceAvailableTypes } from "../utils/schemaParser";
import { StateManager } from "./stateManager";

export interface FieldWithType {
    field: string;
    type: string;
}

//Extremely basic/naive implementation to find extendable entities
//   This should be in language server
export const federationCompletionProvider = {
    async provideCompletionItems(document: TextDocument, position: Position, token: CancellationToken) {
        //Only provide completion items for schemas open in workbench
        if (document.uri.scheme == 'workbench') {
            let line = document.lineAt(position.line);
            let lineText = line.text;
            let serviceName = document.uri.query;

            let completionItems = new Array<FederationEntityExtensionItem>();
            if (lineText && serviceName) {
                //If not undefined, we're inside a word/something and shouldn't return anything
                let trimmedText = lineText.trim();
                let character = trimmedText.charAt(trimmedText.length - 1);
                if (character == ':') {
                    let completionTypes = await getServiceAvailableTypes(serviceName);
                    for (var i = 0; i < completionTypes.length; i++) {
                        let typeName = completionTypes[i];
                        let details = '';
                        let documentation = new MarkdownString();
                        let completionKind = CompletionItemKind.Value;

                        if (typeName.includes(':')) {
                            let typeSplit = typeName.split(':');
                            if (typeSplit[0] == 'I') {
                                details = `Interface ${typeSplit[1]}`;
                                completionKind = CompletionItemKind.Interface;
                                documentation.appendText('To learn more about interfaces, click [here](https://www.apollographql.com/docs/apollo-server/schema/unions-interfaces/#interface-type).');
                            } else if (typeSplit[0] == 'O') {
                                details = `Object Types ${typeSplit[1]}`;
                                completionKind = CompletionItemKind.Class;
                                documentation.appendText('To learn more about object types, click [here](https://www.apollographql.com/docs/apollo-server/schema/schema/#object-types).');
                            } else if (typeSplit[0] == 'S') {
                                details = `Scalar Types ${typeSplit[1]}`;
                                completionKind = CompletionItemKind.Struct;
                                documentation.appendText('To learn more about object types, click [here](https://www.apollographql.com/docs/apollo-server/schema/scalars-enums/#custom-scalars).');
                            }
                            else if (typeSplit[0] == 'E') {
                                details = `Enum Types ${typeSplit[1]}`;
                                completionKind = CompletionItemKind.Enum;
                                documentation.appendText('To learn more about object types, click [here](https://www.apollographql.com/docs/apollo-server/schema/scalars-enums/#enums).');
                            }


                            typeName = typeSplit[1];
                        } else {
                            documentation.appendText(`To learn more about GraphQL's default scalar types, click [here](https://www.apollographql.com/docs/apollo-server/schema/schema/#scalar-types).`);
                        }

                        let completionItem = new CompletionItem(typeName, completionKind);
                        completionItem.insertText = typeName;
                        completionItem.detail = details;
                        completionItem.documentation = documentation;
                        completionItems.push(completionItem);
                    }
                }
            }
            else {
                //Add federation items that can be extended

                let extendableTypes = //StateManager.instance.workspaceState_csdlDefinedEntities;
                    await extractDefinedEntitiesByService();

                for (var sn in extendableTypes)
                    if (sn != serviceName)
                        extendableTypes[sn].map(type => completionItems.push(new FederationEntityExtensionItem(type.type, type.keyFields)));

                //Add default items for creating new entity/type/interface
                completionItems.push(new ObjectTypeCompletionItem());
                completionItems.push(new InterfaceCompletionItem());
                completionItems.push(new EntityObjectTypeCompletionItem());
            }

            if (completionItems.length > 0) return completionItems;
        }
    }
}

export class EntityObjectTypeCompletionItem extends CompletionItem {
    constructor() {
        super('Entity Object type', CompletionItemKind.Snippet);

        // let comments = `"""\nThis is an Entity, docs:https://www.apollographql.com/docs/federation/entities/\nYou will need to define a __resolveReference resolver for the type you define, docs: https://www.apollographql.com/docs/federation/entities/#resolving\n"""`;
        let insertSnippet = new SnippetString(`type `);
        insertSnippet.appendTabstop(1);
        insertSnippet.appendText(` @key(fields:"id") {\n\tid:ID!\n}`);

        this.detail = "Define a new Entity Object Type";
        this.insertText = insertSnippet;
        this.documentation = new MarkdownString(`To learn more about entities, click [here](https://www.apollographql.com/docs/federation/entities/).`);
    }
}

export class ObjectTypeCompletionItem extends CompletionItem {
    constructor() {
        super('Object type', CompletionItemKind.Snippet);

        let insertSnippet = new SnippetString('"""\nHere are some helpful details about your type\n"""\ntype ');
        insertSnippet.appendTabstop(1);
        insertSnippet.appendText(` {\n\n}`);

        this.detail = "Define a new Object Type";
        this.insertText = insertSnippet;
        this.documentation = new MarkdownString(`To learn more about Object Types, click [here](https://www.apollographql.com/docs/apollo-server/schema/schema/#object-types).`);
    }
}

export class InterfaceCompletionItem extends CompletionItem {
    constructor() {
        super('Interface', CompletionItemKind.Snippet);

        let insertSnippet = new SnippetString('interface ');
        insertSnippet.appendTabstop(1);
        insertSnippet.appendText(` {\nHere are some helpful details about your interface\n}`);

        this.detail = "Define a new Interface";
        this.insertText = insertSnippet;
        this.documentation = new MarkdownString(`To learn more about interfaces, click [here](https://www.apollographql.com/docs/apollo-server/schema/unions-interfaces/#interface-type).`);
    }
}

export class FederationEntityExtensionItem extends CompletionItem {
    constructor(typeToExtend: string, keyFields: FieldWithType[]) {
        super(typeToExtend, CompletionItemKind.Reference);

        let insertSnippet = new SnippetString(`extend type `);
        let typeExtensionCodeBlock = `extend type ${typeToExtend} @key(fields:"`;

        insertSnippet.appendVariable("typeToExtend", typeToExtend);
        insertSnippet.appendText(' @key(fields:"');

        let keys = '{ '
        for (var i = 0; i < keyFields.length; i++) {
            let keyField = keyFields[i];
            if (i == keyFields.length - 1) {
                keys += `${keyField.field} }`;
                typeExtensionCodeBlock += keyField.field;
                insertSnippet.appendText(keyField.field);
            } else {
                let fieldWithSpace = `${keyField.field} `;
                keys += fieldWithSpace;
                typeExtensionCodeBlock += fieldWithSpace;
                insertSnippet.appendText(fieldWithSpace);
            }
        }

        typeExtensionCodeBlock += `"){\n`;
        insertSnippet.appendText(`"){\n`);

        for (var i = 0; i < keyFields.length; i++) {
            let keyField = keyFields[i];
            let fieldLine = `\t${keyField.field}: ${keyField.type} @external\n`;
            typeExtensionCodeBlock += fieldLine;
            insertSnippet.appendText(fieldLine);
        }

        insertSnippet.appendTabstop(1);
        typeExtensionCodeBlock += '}';
        insertSnippet.appendText(`\n}`);

        let mkdDocs = new MarkdownString();
        mkdDocs.appendCodeblock(typeExtensionCodeBlock, 'graphql');
        mkdDocs.appendMarkdown(`To learn more about extending entities, click [here](https://www.apollographql.com/docs/federation/entities/#extending).`);

        this.documentation = mkdDocs;
        this.detail = `Extend ${typeToExtend} by keys ${keys}`;
        this.insertText = insertSnippet;
    }
}