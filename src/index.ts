import { initDiscord } from './discordClient'
import { DoorServer } from './doorStatus'
import { DayNightIcon } from './dayNightIcon'
import MembershipStore from './memberships/membershipStore'

async function main (): Promise<void> {
  const client = await initDiscord()
  const doorServer = new DoorServer(client)
  const dayNightIcon = new DayNightIcon(client)
  const membershipStore = new MembershipStore()
  client.membershipStore = membershipStore
  await doorServer.startServer()
  void dayNightIcon.updateIcon().catch(console.error)
  await membershipStore.init()
  console.log('Finished initialisation')
}

void main()
