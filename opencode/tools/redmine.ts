import { tool } from '@opencode-ai/plugin'
import { execSync } from 'child_process'
import path from 'path'

//const REDMINE_SCRIPT_PATH = path.join(__dirname, '../../scripts/redmine.py')
//const REDMINE_SCRIPT_PATH = path.join(__dirname, '../../scripts/redmine.py')
const REDMINE_SCRIPT_PATH = 'redmine.py'

export const view = tool({
  description: 'View Redmine ticket details',
  args: {
    ticketNumber: tool.schema.number().describe('Redmine ticket number'),
    showHistory: tool.schema.boolean().optional().describe('Show field change history in addition to comments'),
  },
  async execute(args) {
    try {
      const historyFlag = args.showHistory ? '--history' : ''
      const command = `"${REDMINE_SCRIPT_PATH}" view ${args.ticketNumber} ${historyFlag}`.trim()
      const result = execSync(command, { encoding: 'utf-8' })
      return result
    } catch (error: any) {
      return `Error viewing ticket: ${error.message}`
    }
  },
})

//export const start = tool({
//  description: 'Start work on a Redmine ticket (creates git branch, updates status to "In Progress")',
//  args: {
//    ticketNumber: tool.schema.number().describe('Redmine ticket number'),
//  },
//  async execute(args) {
//    try {
//      const command = `"${REDMINE_SCRIPT_PATH}" start ${args.ticketNumber}`
//      const result = execSync(command, { encoding: 'utf-8' })
//      return result
//    } catch (error: any) {
//      return `Error starting ticket: ${error.message}`
//    }
//  },
//})
//
//export const summary = tool({
//  description: 'Show tickets assigned to current user',
//  args: {
//    status: tool.schema.string().optional().describe('Filter by status (e.g., "New", "In Progress,Resolved"). Use commas for multiple statuses'),
//    priority: tool.schema.string().optional().describe('Filter by priority (e.g., "Low", "Normal,High"). Use commas for multiple priorities'),
//  },
//  async execute(args) {
//    try {
//      let command = `"${REDMINE_SCRIPT_PATH}" summary`
//      if (args.status) {
//        command += ` --status "${args.status}"`
//      }
//      if (args.priority) {
//        command += ` --priority "${args.priority}"`
//      }
//      const result = execSync(command, { encoding: 'utf-8' })
//      return result
//    } catch (error: any) {
//      return `Error getting ticket summary: ${error.message}`
//    }
//  },
//})

export const note = tool({
  description: 'Add a note/comment to a Redmine ticket',
  args: {
    ticketNumber: tool.schema.number().describe('Redmine ticket number'),
    note: tool.schema.string().describe('Note text to add to the ticket'),
  },
  async execute(args) {
    try {
      const command = `"${REDMINE_SCRIPT_PATH}" note ${args.ticketNumber} "${args.note}"`
      const result = execSync(command, { encoding: 'utf-8' })
      return result
    } catch (error: any) {
      return `Error adding note: ${error.message}`
    }
  },
})

export const setStatus = tool({
  description: 'Set Redmine ticket status',
  args: {
    ticketNumber: tool.schema.number().describe('Redmine ticket number'),
    status: tool.schema.string().describe('Target status (e.g., "new", "in progress", "resolved", "closed", "rejected", "feedback")'),
  },
  async execute(args) {
    try {
      const command = `"${REDMINE_SCRIPT_PATH}" set-status ${args.ticketNumber} "${args.status}"`
      const result = execSync(command, { encoding: 'utf-8' })
      return result
    } catch (error: any) {
      return `Error setting ticket status: ${error.message}`
    }
  },
})

//export const report = tool({
//  description: 'Generate weekly report in HTML format for In Progress and Resolved tickets',
//  args: {},
//  async execute(args) {
//    try {
//      const command = `"${REDMINE_SCRIPT_PATH}" report`
//      const result = execSync(command, { encoding: 'utf-8' })
//      return result
//    } catch (error: any) {
//      return `Error generating report: ${error.message}`
//    }
//  },
//})
