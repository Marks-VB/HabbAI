using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net.Sockets;
using System.Threading;
using System.Windows.Forms;

namespace HabblaudLauncher
{
    static class Program
    {
        private static Process serverProcess;
        private static NotifyIcon trayIcon;
        private static Mutex mutex;
        private const string MutexName = "Habblaud_SingleInstance_Mutex_4747";
        private const int Port = 4747;
        private const string Url = "http://localhost:4747";

        [STAThread]
        static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool isFirstInstance;
            mutex = new Mutex(true, MutexName, out isFirstInstance);

            if (!isFirstInstance)
            {
                // Já está rodando: só abre o navegador
                OpenBrowser(Url);
                return;
            }

            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            Directory.SetCurrentDirectory(baseDir);

            // Inicia o servidor se a porta não estiver respondendo
            if (!IsPortOpen("127.0.0.1", Port))
            {
                StartServer(baseDir);
            }

            // Aguarda o servidor responder (até 5 segundos)
            for (int i = 0; i < 20; i++)
            {
                if (IsPortOpen("127.0.0.1", Port)) break;
                Thread.Sleep(250);
            }

            // Abre o navegador
            OpenBrowser(Url);

            // Cria o ícone na bandeja (System Tray)
            trayIcon = new NotifyIcon();
            trayIcon.Text = "Habblaud - Escritório Virtual";
            
            string icoPath = Path.Combine(baseDir, "habblaud.ico");
            if (File.Exists(icoPath))
            {
                try { trayIcon.Icon = new Icon(icoPath); }
                catch { trayIcon.Icon = SystemIcons.Application; }
            }
            else
            {
                trayIcon.Icon = SystemIcons.Application;
            }

            ContextMenuStrip menu = new ContextMenuStrip();
            menu.Items.Add("Abrir no navegador", null, (s, e) => OpenBrowser(Url));
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add("Reiniciar Servidor", null, (s, e) => {
                StopServer();
                StartServer(baseDir);
                OpenBrowser(Url);
            });
            menu.Items.Add("Sair", null, (s, e) => {
                StopServer();
                trayIcon.Visible = false;
                Application.Exit();
            });

            trayIcon.ContextMenuStrip = menu;
            trayIcon.DoubleClick += (s, e) => OpenBrowser(Url);
            trayIcon.Visible = true;

            trayIcon.ShowBalloonTip(3000, "Habblaud", "Escritório virtual iniciado em http://localhost:4747", ToolTipIcon.Info);

            Application.ApplicationExit += (s, e) => StopServer();
            Application.Run();
        }

        private static bool IsPortOpen(string host, int port)
        {
            try
            {
                using (var client = new TcpClient())
                {
                    var result = client.BeginConnect(host, port, null, null);
                    bool success = result.AsyncWaitHandle.WaitOne(200);
                    if (!success) return false;
                    client.EndConnect(result);
                    return true;
                }
            }
            catch
            {
                return false;
            }
        }

        private static void StartServer(string dir)
        {
            try
            {
                string serverScript = Path.Combine(dir, "dist", "server", "index.js");
                if (!File.Exists(serverScript))
                {
                    serverScript = Path.Combine(dir, "server", "index.ts");
                }

                ProcessStartInfo psi = new ProcessStartInfo();
                if (serverScript.EndsWith(".js"))
                {
                    psi.FileName = "node";
                    psi.Arguments = string.Format("\"{0}\"", serverScript);
                }
                else
                {
                    psi.FileName = "npx";
                    psi.Arguments = string.Format("tsx \"{0}\"", serverScript);
                }

                psi.WorkingDirectory = dir;
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                psi.WindowStyle = ProcessWindowStyle.Hidden;

                serverProcess = Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Não foi possível iniciar o Habblaud:\n" + ex.Message, "Erro no Habblaud", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private static void StopServer()
        {
            try
            {
                if (serverProcess != null && !serverProcess.HasExited)
                {
                    serverProcess.Kill();
                    serverProcess = null;
                }
            }
            catch { }
        }

        private static void OpenBrowser(string url)
        {
            try
            {
                Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
            }
            catch (Exception ex)
            {
                MessageBox.Show("Erro ao abrir navegador: " + ex.Message);
            }
        }
    }
}
