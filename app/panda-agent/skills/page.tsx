import Image from 'next/image';
import Link from 'next/link';
import {redirect} from 'next/navigation';
import {guideAdminAccess} from '@/Panda-agent/src/server/guide-admin';
import {SkillsPanel} from '@/app/admin/rag-control-room/skills-panel';
import {AdminThemeProvider} from '@/components/admin/admin-theme';
import {adminFont} from '@/components/admin/admin-font';
import styles from './skills.module.css';
export default async function AgentSkillsPage(){
 const access=await guideAdminAccess();
 if(!access.allowed&&access.status===401)redirect('/sign-in?redirect_url=%2Fpanda-agent%2Fskills');
 return <AdminThemeProvider fontFamily={adminFont.style.fontFamily}><main id="main" className={styles.screen}>
  <header className={styles.header}><Link href="/panda-agent" className={styles.brand}><Image src="/brand/pandabyte-logo.png" width={40} height={40} alt="PandaByte"/><span>Panda Agent</span></Link><Link href="/panda-agent">Back to chat</Link></header>
  {access.allowed?<><h1>Agent skills</h1><p>Review the bundled versions and control which skills can run in projects.</p><SkillsPanel/></>:<><h1>{access.status===403?'Access denied':'Agent administration is unavailable'}</h1><p>{access.status===403?'An active administrator membership is required.':'Please try again later.'}</p></>}
 </main></AdminThemeProvider>;
}
