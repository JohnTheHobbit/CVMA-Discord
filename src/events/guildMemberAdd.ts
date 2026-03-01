import { GuildMember } from 'discord.js';
import logger from '../utils/logger';

export async function onGuildMemberAdd(member: GuildMember): Promise<void> {
  logger.info(`New member joined: ${member.user.tag}`);
}
