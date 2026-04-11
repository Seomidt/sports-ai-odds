import { 
  useGetAdminStats, 
  useGetAdminUsers, 
  useAddAdminUser, 
  useDeleteAdminUser, 
  useUpdateAdminUser 
} from "@workspace/api-client-react";
import { Layout } from "@/components/Layout";
import { Activity, ShieldAlert, Users, Server, Plus, Trash2, Shield, User as UserIcon } from "lucide-react";
import { format } from "date-fns";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { AddUserBodyRole, UpdateUserBodyRole } from "@workspace/api-client-react";
import { useGetMe } from "@workspace/api-client-react";
import { Redirect } from "wouter";

export function Admin() {
  const { data: me } = useGetMe();
  const { data: statsData, isLoading: isLoadingStats } = useGetAdminStats();
  const { data: usersData, isLoading: isLoadingUsers } = useGetAdminUsers();
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const addMutation = useAddAdminUser();
  const deleteMutation = useDeleteAdminUser();
  const updateMutation = useUpdateAdminUser();

  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AddUserBodyRole>("user");

  if (me && me.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }

  const handleAddUser = async () => {
    if (!newEmail) return;
    try {
      await addMutation.mutateAsync({ data: { email: newEmail, role: newRole } });
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      setNewEmail("");
      toast({ title: "User added successfully" });
    } catch (e) {
      toast({ title: "Failed to add user", variant: "destructive" });
    }
  };

  const handleDeleteUser = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      toast({ title: "User removed" });
    } catch (e) {
      toast({ title: "Failed to remove user", variant: "destructive" });
    }
  };

  const handleUpdateRole = async (id: number, role: string) => {
    try {
      await updateMutation.mutateAsync({ id, data: { role: role as UpdateUserBodyRole } });
      queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
      toast({ title: "Role updated" });
    } catch (e) {
      toast({ title: "Failed to update role", variant: "destructive" });
    }
  };

  return (
    <Layout>
      <div className="space-y-8">
        <header>
          <h1 className="text-3xl font-bold font-mono tracking-tight text-white mb-2 flex items-center">
            <ShieldAlert className="w-8 h-8 mr-3 text-destructive" />
            SYSTEM ADMINISTRATION
          </h1>
          <p className="text-muted-foreground">Manage platform access and monitor API quotas.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: API Stats */}
          <div className="space-y-6">
            <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-4 border-b border-white/10 pb-2 flex items-center">
              <Server className="w-5 h-5 mr-2 text-primary" />
              API TELEMETRY
            </h2>
            
            {isLoadingStats ? (
              <div className="flex justify-center py-8"><Activity className="w-6 h-6 text-primary animate-pulse" /></div>
            ) : statsData ? (
              <div className="space-y-6">
                <div className="glass-card p-6 rounded-xl">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-sm font-mono text-muted-foreground uppercase">Requests Today</span>
                    <span className="text-2xl font-mono font-bold text-white">
                      {statsData.requestsToday} <span className="text-sm text-muted-foreground">/ {statsData.maxPerDay}</span>
                    </span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-2.5 mb-4 overflow-hidden">
                    <div 
                      className={`h-2.5 rounded-full ${statsData.requestsToday / statsData.maxPerDay > 0.8 ? 'bg-destructive' : 'bg-primary'}`} 
                      style={{ width: `${Math.min((statsData.requestsToday / statsData.maxPerDay) * 100, 100)}%` }}
                    ></div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mt-6 border-t border-white/10 pt-4">
                    <div>
                      <div className="text-xs font-mono text-muted-foreground uppercase mb-1">Last Hour</div>
                      <div className="text-lg font-mono text-white">{statsData.requestsThisHour}</div>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-muted-foreground uppercase mb-1">Remaining</div>
                      <div className="text-lg font-mono text-white">{statsData.remaining}</div>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-6 rounded-xl">
                  <h3 className="text-sm font-mono text-muted-foreground uppercase mb-4">Recent Ingestions</h3>
                  <div className="space-y-3">
                    {statsData.recentRequests?.map((req, i) => (
                      <div key={i} className="flex justify-between items-center text-sm font-mono border-b border-white/5 pb-2 last:border-0">
                        <span className="text-white truncate pr-4">{req.endpoint}</span>
                        <span className="text-muted-foreground whitespace-nowrap">{format(new Date(req.time), 'HH:mm:ss')}</span>
                      </div>
                    ))}
                    {!statsData.recentRequests?.length && (
                      <div className="text-sm text-muted-foreground text-center py-4">No recent activity</div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Right Column: User Management */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-xl font-bold text-white uppercase tracking-wider mb-4 border-b border-white/10 pb-2 flex items-center">
              <Users className="w-5 h-5 mr-2 text-primary" />
              ACCESS CONTROL
            </h2>
            
            <div className="glass-card p-6 rounded-xl space-y-6">
              <div className="flex gap-4 items-end bg-black/20 p-4 rounded-lg border border-white/5">
                <div className="flex-1 space-y-2">
                  <label className="text-xs font-mono text-muted-foreground uppercase">Email Address</label>
                  <Input 
                    placeholder="analyst@syndicate.com" 
                    value={newEmail} 
                    onChange={e => setNewEmail(e.target.value)} 
                    className="bg-black/40 border-white/10 font-mono"
                  />
                </div>
                <div className="w-32 space-y-2">
                  <label className="text-xs font-mono text-muted-foreground uppercase">Role</label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as AddUserBodyRole)}>
                    <SelectTrigger className="bg-black/40 border-white/10 font-mono">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleAddUser} disabled={!newEmail || addMutation.isPending} className="font-mono tracking-wider">
                  <Plus className="w-4 h-4 mr-2" /> ADD
                </Button>
              </div>

              {isLoadingUsers ? (
                <div className="flex justify-center py-8"><Activity className="w-6 h-6 text-primary animate-pulse" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-black/20 font-mono border-b border-white/10">
                      <tr>
                        <th className="px-4 py-3 font-normal">Analyst</th>
                        <th className="px-4 py-3 font-normal">Role</th>
                        <th className="px-4 py-3 font-normal">Granted At</th>
                        <th className="px-4 py-3 font-normal text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usersData?.users?.map((user) => (
                        <tr key={user.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="px-4 py-4 font-medium text-white flex items-center">
                            {user.role === 'admin' ? <Shield className="w-4 h-4 mr-2 text-secondary" /> : <UserIcon className="w-4 h-4 mr-2 text-muted-foreground" />}
                            {user.email}
                          </td>
                          <td className="px-4 py-4">
                            <Select 
                              value={user.role} 
                              onValueChange={(v) => handleUpdateRole(user.id, v)}
                              disabled={updateMutation.isPending}
                            >
                              <SelectTrigger className="w-28 h-8 bg-transparent border-white/10 text-xs font-mono">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="user">User</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          </td>
                          <td className="px-4 py-4 font-mono text-muted-foreground text-xs">
                            {format(new Date(user.createdAt), 'MMM dd, yyyy HH:mm')}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="text-destructive hover:bg-destructive/20 hover:text-destructive h-8 px-2"
                              onClick={() => handleDeleteUser(user.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {!usersData?.users?.length && (
                        <tr>
                          <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                            No authorized analysts found.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
