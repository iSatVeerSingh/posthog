import {
    ActionFilter,
    AnyPartialFilterType,
    BreakdownKeyType,
    BreakdownType,
    CohortType,
    EntityFilter,
    InsightModel,
    InsightShortId,
    InsightType,
    PathsFilterType,
    PathType,
} from '~/types'
import { ensureStringIsNotBlank, humanFriendlyNumber, objectsEqual } from 'lib/utils'
import { dashboardLogic } from 'scenes/dashboard/dashboardLogic'
import { savedInsightsLogic } from 'scenes/saved-insights/savedInsightsLogic'
import { keyMapping } from 'lib/components/PropertyKeyInfo'
import api from 'lib/api'
import { dayjs } from 'lib/dayjs'
import { getCurrentTeamId } from 'lib/utils/logics'
import { dashboardsModel } from '~/models/dashboardsModel'
import { insightLogic } from './insightLogic'
import { FormatPropertyValueForDisplayFunction } from '~/models/propertyDefinitionsModel'
import { ReactNode } from 'react'
import { ActionsNode, BreakdownFilter, EventsNode } from '~/queries/schema'
import { isEventsNode } from '~/queries/utils'
import { urls } from 'scenes/urls'
import { examples } from '~/queries/examples'

export const getDisplayNameFromEntityFilter = (
    filter: EntityFilter | ActionFilter | null,
    isCustom = true
): string | null => {
    // Make sure names aren't blank strings
    const customName = ensureStringIsNotBlank(filter?.custom_name)
    let name = ensureStringIsNotBlank(filter?.name)
    if (name && name in keyMapping.event) {
        name = keyMapping.event[name].label
    }
    if (filter?.type === 'events' && filter.id === null) {
        name = 'All events'
    }

    // Return custom name. If that doesn't exist then the name, then the id, then just null.
    return (isCustom ? customName : null) ?? name ?? (filter?.id ? `${filter?.id}` : null)
}

export const getDisplayNameFromEntityNode = (node: EventsNode | ActionsNode, isCustom = true): string | null => {
    // Make sure names aren't blank strings
    const customName = ensureStringIsNotBlank(node?.custom_name)
    let name = ensureStringIsNotBlank(node?.name)
    if (name && name in keyMapping.event) {
        name = keyMapping.event[name].label
    }
    if (isEventsNode(node) && node.event === null) {
        name = 'All events'
    }

    const id = isEventsNode(node) ? node.event : node.id

    // Return custom name. If that doesn't exist then the name, then the id, then just null.
    return (isCustom ? customName : null) ?? name ?? (!!id ? `${id}` : null)
}

export function extractObjectDiffKeys(
    oldObj: AnyPartialFilterType,
    newObj: AnyPartialFilterType,
    prefix: string = ''
): Record<string, any> {
    if (Object.keys(oldObj).length === 0) {
        return []
    }

    let changedKeys: Record<string, any> = {}
    for (const [key, value] of Object.entries(newObj)) {
        const valueOrArray = value || []
        const oldValue = (oldObj as Record<string, any>)[key] || []
        if (!objectsEqual(value, oldValue)) {
            if (key === 'events') {
                if (valueOrArray.length !== oldValue.length) {
                    changedKeys['changed_events_length'] = oldValue?.length
                } else {
                    valueOrArray.forEach((event: Record<string, any>, idx: number) => {
                        changedKeys = {
                            ...changedKeys,
                            ...extractObjectDiffKeys(oldValue[idx], event, `event_${idx}_`),
                        }
                    })
                }
            } else if (key === 'actions') {
                if (valueOrArray.length !== oldValue.length) {
                    changedKeys['changed_actions_length'] = oldValue.length
                } else {
                    valueOrArray.forEach((action: Record<string, any>, idx: number) => {
                        changedKeys = {
                            ...changedKeys,
                            ...extractObjectDiffKeys(oldValue[idx], action, `action_${idx}_`),
                        }
                    })
                }
            } else {
                changedKeys[`changed_${prefix}${key}`] = oldValue
            }
        }
    }

    return changedKeys
}

export function findInsightFromMountedLogic(
    insightShortId: InsightShortId | string,
    dashboardId: number | undefined
): Partial<InsightModel> | null {
    if (dashboardId) {
        const insightOnDashboard = dashboardLogic
            .findMounted({ id: dashboardId })
            ?.values.insightTiles?.find((tile) => tile.insight?.short_id === insightShortId)?.insight
        if (insightOnDashboard) {
            return insightOnDashboard
        } else {
            const dashboards = dashboardsModel.findMounted()?.values.rawDashboards
            let foundOnModel: Partial<InsightModel> | undefined
            for (const dashModelId of Object.keys(dashboards || {})) {
                foundOnModel = dashboardLogic
                    .findMounted({ id: parseInt(dashModelId) })
                    ?.values.insightTiles?.find((tile) => tile.insight?.short_id === insightShortId)?.insight
            }
            return foundOnModel || null
        }
    } else {
        return (
            savedInsightsLogic
                .findMounted()
                ?.values.insights?.results?.find((item) => item.short_id === insightShortId) || null
        )
    }
}

export async function getInsightId(shortId: InsightShortId): Promise<number | undefined> {
    const insightId = insightLogic.findMounted({ dashboardItemId: shortId })?.values?.insight?.id

    return insightId
        ? insightId
        : (await api.get(`api/projects/${getCurrentTeamId()}/insights/?short_id=${encodeURIComponent(shortId)}`))
              .results[0]?.id
}

export function humanizePathsEventTypes(include_event_types: PathsFilterType['include_event_types']): string[] {
    let humanEventTypes: string[] = []
    if (include_event_types) {
        let matchCount = 0
        if (include_event_types.includes(PathType.PageView)) {
            humanEventTypes.push('page views')
            matchCount++
        }
        if (include_event_types.includes(PathType.Screen)) {
            humanEventTypes.push('screen views')
            matchCount++
        }
        if (include_event_types.includes(PathType.CustomEvent)) {
            humanEventTypes.push('custom events')
            matchCount++
        }
        if (matchCount === 0 || matchCount === Object.keys(PathType).length) {
            humanEventTypes = ['all events']
        }
    }
    return humanEventTypes
}

export function formatAggregationValue(
    property: string | undefined,
    propertyValue: number | null,
    renderCount: (value: number) => ReactNode = (x) => <>{humanFriendlyNumber(x)}</>,
    formatPropertyValueForDisplay?: FormatPropertyValueForDisplayFunction
): ReactNode {
    if (propertyValue === null) {
        return '-'
    }

    let formattedValue: ReactNode
    if (property && formatPropertyValueForDisplay) {
        formattedValue = formatPropertyValueForDisplay(property, propertyValue)
        // yes, double equals not triple equals  ¯\_(ツ)_/¯ let JS compare strings and numbers however it wants
        if (formattedValue == propertyValue) {
            // formatPropertyValueForDisplay didn't change the value...
            formattedValue = renderCount(propertyValue)
        }
    } else {
        formattedValue = renderCount(propertyValue)
    }

    // Since `propertyValue` is a number. `formatPropertyValueForDisplay` will only return a string
    // To make typescript happy we handle the possible but impossible string array inside this function
    return Array.isArray(formattedValue) ? formattedValue[0] : formattedValue
}

export function formatBreakdownLabel(
    cohorts: CohortType[] | undefined,
    formatPropertyValueForDisplay: FormatPropertyValueForDisplayFunction | undefined,
    breakdown_value: BreakdownKeyType | undefined,
    breakdown: BreakdownKeyType | undefined,
    breakdown_type: BreakdownType | null | undefined,
    isHistogram?: boolean
): string {
    if (isHistogram && typeof breakdown_value === 'string') {
        // replace nan with null
        const bucketValues = breakdown_value.replace(/\bnan\b/g, 'null')
        const [bucketStart, bucketEnd] = JSON.parse(bucketValues)
        const formattedBucketStart = formatBreakdownLabel(
            cohorts,
            formatPropertyValueForDisplay,
            bucketStart,
            breakdown,
            breakdown_type
        )
        const formattedBucketEnd = formatBreakdownLabel(
            cohorts,
            formatPropertyValueForDisplay,
            bucketEnd,
            breakdown,
            breakdown_type
        )
        return `${formattedBucketStart} – ${formattedBucketEnd}`
    }
    if (breakdown_type === 'cohort') {
        // :TRICKY: Different endpoints represent the all users cohort breakdown differently
        if (breakdown_value === 0 || breakdown_value === 'all') {
            return 'All Users'
        }
        return cohorts?.filter((c) => c.id == breakdown_value)[0]?.name ?? (breakdown_value || '').toString()
    } else if (typeof breakdown_value == 'number') {
        return formatPropertyValueForDisplay
            ? formatPropertyValueForDisplay(breakdown, breakdown_value)?.toString() ?? 'None'
            : breakdown_value.toString()
    } else if (typeof breakdown_value == 'string') {
        return breakdown_value === 'nan' ? 'Other' : breakdown_value === '' ? 'None' : breakdown_value
    } else if (Array.isArray(breakdown_value)) {
        return breakdown_value.join('::')
    } else {
        return ''
    }
}

export function formatBreakdownType(breakdownFilter: BreakdownFilter): string {
    if (breakdownFilter.breakdown_type === 'cohort') {
        return 'Cohort'
    } else {
        return breakdownFilter?.breakdown?.toString() || 'Breakdown Value'
    }
}

export function sortDates(dates: Array<string | null>): Array<string | null> {
    return dates.sort((a, b) => (dayjs(a).isAfter(dayjs(b)) ? 1 : -1))
}

// Gets content-length header from a fetch Response
export function getResponseBytes(apiResponse: Response): number {
    return parseInt(apiResponse.headers.get('Content-Length') ?? '0')
}

export const insightTypeURL: Record<InsightType, string> = {
    TRENDS: urls.insightNew({ insight: InsightType.TRENDS }),
    STICKINESS: urls.insightNew({ insight: InsightType.STICKINESS }),
    LIFECYCLE: urls.insightNew({ insight: InsightType.LIFECYCLE }),
    FUNNELS: urls.insightNew({ insight: InsightType.FUNNELS }),
    RETENTION: urls.insightNew({ insight: InsightType.RETENTION }),
    PATHS: urls.insightNew({ insight: InsightType.PATHS }),
    JSON: urls.insightNew(undefined, undefined, JSON.stringify(examples.EventsTableFull)),
    SQL: urls.insightNew(undefined, undefined, JSON.stringify(examples.HogQLTable)),
}
