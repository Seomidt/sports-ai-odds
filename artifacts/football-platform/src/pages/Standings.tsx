import { useGetStandings } from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Activity } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState } from "react";

const LEAGUES = [
  { id: 39, name: "Premier League" },
  { id: 140, name: "La Liga" },
  { id: 135, name: "Serie A" },
  { id: 78, name: "Bundesliga" },
  { id: 2, name: "Champions League" }
];

export function Standings() {
  const [activeLeague, setActiveLeague] = useState<string>(LEAGUES[0].id.toString());
  
  const { data, isLoading } = useGetStandings(Number(activeLeague), {
    query: { enabled: !!activeLeague, queryKey: ['standings', Number(activeLeague)] }
  });

  return (
    <Layout>
      <div className="space-y-6">
        <header>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-white mb-2">LEAGUE STANDINGS</h1>
          <p className="text-muted-foreground">Current tables for monitored competitions.</p>
        </header>

        <Tabs value={activeLeague} onValueChange={setActiveLeague} className="w-full">
          <TabsList className="bg-black/40 border border-white/10 p-1 flex flex-wrap h-auto">
            {LEAGUES.map((league) => (
              <TabsTrigger 
                key={league.id} 
                value={league.id.toString()} 
                className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary font-mono text-xs tracking-wider uppercase whitespace-nowrap"
              >
                {league.name}
              </TabsTrigger>
            ))}
          </TabsList>
          
          <div className="mt-6 glass-card rounded-xl overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Activity className="w-8 h-8 text-primary animate-pulse" />
              </div>
            ) : !data?.standings?.length ? (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                No standings data available for this competition.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-white/10 hover:bg-transparent">
                      <TableHead className="w-12 text-center text-muted-foreground font-mono">#</TableHead>
                      <TableHead className="text-muted-foreground font-mono">CLUB</TableHead>
                      <TableHead className="text-center text-muted-foreground font-mono">MP</TableHead>
                      <TableHead className="text-center text-muted-foreground font-mono">W</TableHead>
                      <TableHead className="text-center text-muted-foreground font-mono">D</TableHead>
                      <TableHead className="text-center text-muted-foreground font-mono">L</TableHead>
                      <TableHead className="text-center text-muted-foreground font-mono hidden md:table-cell">GF</TableHead>
                      <TableHead className="text-center text-muted-foreground font-mono hidden md:table-cell">GA</TableHead>
                      <TableHead className="text-center text-muted-foreground font-mono hidden sm:table-cell">GD</TableHead>
                      <TableHead className="text-center text-white font-mono font-bold">PTS</TableHead>
                      <TableHead className="text-center text-muted-foreground font-mono hidden lg:table-cell">FORM</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.standings.map((row) => (
                      <TableRow key={row.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                        <TableCell className="text-center font-mono font-bold text-white">{row.rank}</TableCell>
                        <TableCell className="font-medium text-white">
                          <div className="flex items-center gap-2">
                            {row.teamLogo && (
                              <img src={row.teamLogo} alt="" className="w-5 h-5 object-contain shrink-0" />
                            )}
                            <span className="truncate">{row.teamName ?? row.teamId}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center font-mono">{row.played}</TableCell>
                        <TableCell className="text-center font-mono">{row.won}</TableCell>
                        <TableCell className="text-center font-mono">{row.drawn}</TableCell>
                        <TableCell className="text-center font-mono">{row.lost}</TableCell>
                        <TableCell className="text-center font-mono hidden md:table-cell">{row.goalsFor}</TableCell>
                        <TableCell className="text-center font-mono hidden md:table-cell">{row.goalsAgainst}</TableCell>
                        <TableCell className="text-center font-mono hidden sm:table-cell">{row.goalsDiff}</TableCell>
                        <TableCell className="text-center font-mono font-bold text-primary">{row.points}</TableCell>
                        <TableCell className="text-center font-mono text-xs tracking-widest hidden lg:table-cell">
                          {row.form?.split('').map((char, i) => (
                            <span 
                              key={i} 
                              className={`inline-block w-4 h-4 mx-0.5 rounded-sm text-center leading-none ${
                                char === 'W' ? 'bg-primary/20 text-primary' : 
                                char === 'D' ? 'bg-white/10 text-muted-foreground' : 
                                'bg-destructive/20 text-destructive'
                              }`}
                            >
                              {char}
                            </span>
                          ))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </Tabs>
      </div>
    </Layout>
  );
}
