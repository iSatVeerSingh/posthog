import { mergeAttributes, Node, nodePasteRule, NodeViewProps } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { NodeWrapper } from 'scenes/notebooks/Nodes/NodeWrapper'
import { NotebookNodeType } from 'scenes/notebooks/Nodes/types'
import { useValues } from 'kea'
import { LemonDivider } from '@posthog/lemon-ui'
import { urls } from 'scenes/urls'
import { createUrlRegex } from './utils'
import { PersonHeader } from '@posthog/apps-common'
import { personLogic } from 'scenes/persons/personLogic'
import { PropertiesTable } from 'lib/components/PropertiesTable'
import { LemonSkeleton } from 'lib/lemon-ui/LemonSkeleton'

const Component = (props: NodeViewProps): JSX.Element => {
    const id = props.node.attrs.id
    const logic = personLogic({ id })

    const { person, personLoading } = useValues(logic)

    return (
        <NodeWrapper className={NotebookNodeType.Person} title="Person" {...props} href={urls.person(id)}>
            <div className="border bg-inverse rounded">
                <div className="p-4">
                    {personLoading ? (
                        <LemonSkeleton className="h-6" />
                    ) : (
                        <PersonHeader withIcon person={person} noLink />
                    )}
                </div>

                {props.selected && (
                    <>
                        <LemonDivider className="my-0" />
                        <div className="p-2 max-h-100 overflow-y-auto">
                            <PropertiesTable properties={person?.properties} filterable searchable />
                        </div>
                    </>
                )}
            </div>
        </NodeWrapper>
    )
}

export const NotebookNodePerson = Node.create({
    name: NotebookNodeType.Person,
    group: 'block',
    atom: true,
    draggable: true,

    addAttributes() {
        return {
            id: '',
        }
    },

    parseHTML() {
        return [
            {
                tag: NotebookNodeType.Person,
            },
        ]
    },

    renderHTML({ HTMLAttributes }) {
        return [NotebookNodeType.Person, mergeAttributes(HTMLAttributes)]
    },

    addNodeView() {
        return ReactNodeViewRenderer(Component)
    },

    addPasteRules() {
        return [
            nodePasteRule({
                find: createUrlRegex(urls.person('') + '(.+)'),
                type: this.type,
                getAttributes: (match) => {
                    return { id: match[1] }
                },
            }),
        ]
    },
})
